import "server-only";
import { bulkSchema } from "./bulk-schema";
import { data } from "./data";
import { cleanupData } from "./cleanup-data";
import { lockIdentity, unlockIdentity } from "./identity";
import { installation } from "./installation";
import { HttpError, requireAdmin, requirePublisher } from "./auth";
import { document, saveContent } from "./content";
import { adminSnapshot } from "./admin-snapshot";
import { metadataPatch, type BulkResult } from "@/lib/bulk-actions";
import type { User } from "@/lib/types";

export async function bulkAction(
  user: User | null,
  input: unknown,
): Promise<BulkResult[]> {
  requirePublisher(user);
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error.issues.map((i) => i.message).join(" "),
    );
  const request = parsed.data;
  if (request.entity === "user") requireAdmin(user);
  if (request.entity === "user" && request.operation === "delete") {
    if (!request.governanceExpected)
      throw new HttpError(400, "Reload the People list before deleting users.");
    const results = await cleanupData().deleteUsers({
      actor: user.id,
      expected: request.governanceExpected,
      ids: request.items.map((i) => i.id),
      owner: installation().owner,
    });
    // Fresh profile checks already deny existing tokens; ban also prevents new Auth sessions.
    for (const result of results)
      if (result.status === "changed") {
        let locked = false;
        try {
          await lockIdentity(result.id);
          locked = true;
        } catch {
          // The fresh inactive profile already denies access. The worker retries.
        }
        await cleanupData().recordIdentityLock(
          result.id,
          locked,
          locked ? null : "Account inactive. Auth session lock will retry.",
        );
      }
    return results;
  }
  const workspace = ["category", "section"].includes(request.operation)
    ? await adminSnapshot(user, "content")
    : undefined;
  if (workspace && ["category", "section"].includes(request.operation)) {
    const selected = request.items.map((i) =>
      workspace.content.find((c) => c.id === i.id),
    );
    if (
      selected.some((c) => !c) ||
      new Set(selected.map((c) => c?.kind)).size !== 1
    )
      throw new HttpError(
        400,
        "Select one content type to change its category or section.",
      );
  }
  if (workspace && request.operation === "section")
    request.items.sort((a, b) => {
      const first = workspace.content.find((c) => c.id === a.id),
        second = workspace.content.find((c) => c.id === b.id);
      return (
        (first?.sectionOrder || 0) - (second?.sectionOrder || 0) ||
        (second?.updatedAt || "").localeCompare(first?.updatedAt || "") ||
        a.id.localeCompare(b.id)
      );
    });
  const results: BulkResult[] = [];
  for (const target of request.items) {
    try {
      if (request.operation === "restore") {
        if (request.entity === "user") {
          const deleted = await cleanupData().recoveryState(target.id);
          if (
            !deleted?.authLocked ||
            deleted.purging ||
            Date.parse(deleted.purgeAfter) <= Date.now()
          )
            throw new HttpError(
              400,
              "This account is not ready to restore, or its recovery window has ended.",
            );
          await unlockIdentity(target.id);
        }
        const status = await cleanupData().restore({
          actor: user.id,
          entity: request.entity,
          id: target.id,
          expected: target.expected,
        });
        results.push({ id: target.id, status });
        // Restored users remain inactive; every application entry point checks the fresh profile.
        continue;
      }
      const row = await data().findDocument(target.id);
      if (!row) throw new HttpError(404, "Content not found.");
      if (request.operation === "publish") {
        if (row.deleted_at)
          throw new HttpError(400, "Restore this item before publishing.");
        if (row.revision !== target.expected)
          throw new HttpError(
            409,
            "This item changed. Refresh and review the saved data before retrying.",
          );
        if (row.published_revision === row.revision) {
          results.push({ id: target.id, status: "unchanged" });
          continue;
        }
        await saveContent(
          user,
          document(row, true),
          target.expected,
          true,
          "bulk",
        );
        results.push({ id: target.id, status: "changed" });
      } else {
        const patch = workspace
          ? metadataPatch(
              workspace,
              document(row, true),
              request.operation,
              request.value || "",
            )
          : {};
        const status = await cleanupData().mutateContent({
          actor: user.id,
          id: target.id,
          expected: target.expected,
          operation: workspace ? "metadata" : request.operation,
          patch,
          settingsExpected: workspace?.revision ?? null,
        });
        results.push({ id: target.id, status });
      }
    } catch (error) {
      const known = error instanceof HttpError;
      results.push({
        id: target.id,
        status: "failed",
        message: known
          ? String((error as Error).message)
          : "Could not confirm this change. Refresh before retrying.",
      });
    }
  }
  return results;
}
