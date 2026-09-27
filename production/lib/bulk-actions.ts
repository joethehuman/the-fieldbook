import "server-only";
import { bulkSchema } from "./bulk-schema";
import { db, check } from "./db";
import { env } from "./env";
import { HttpError, requireAdmin } from "./auth";
import { document, saveContent } from "./content";
import { adminSnapshot } from "./admin-snapshot";
import { metadataPatch, type BulkResult } from "@/lib/bulk-actions";
import type { User } from "@/lib/types";

export async function bulkAction(
  user: User | null,
  input: unknown,
): Promise<BulkResult[]> {
  requireAdmin(user);
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error.issues.map((i) => i.message).join(" "),
    );
  const request = parsed.data;
  if (request.entity === "user" && request.operation === "delete") {
    if (!request.governanceExpected)
      throw new HttpError(400, "Reload the People list before deleting users.");
    const { data, error } = await db().rpc("fb_delete_users", {
      p_actor: user.id,
      p_expected: request.governanceExpected,
      p_ids: request.items.map((i) => i.id),
      p_owner: env().owner,
    });
    check(error);
    // Fresh profile checks already deny existing tokens; ban also prevents new Auth sessions.
    for (const result of data as BulkResult[])
      if (result.status === "changed") {
        const { error: banError } = await db().auth.admin.updateUserById(
          result.id,
          {
            ban_duration: "876600h",
          },
        );
        const { error: lockError } = await db()
          .from("fb_deleted_items")
          .update(
            banError
              ? { error: "Account inactive. Auth session lock will retry." }
              : { auth_locked: true, error: null },
          )
          .eq("entity", "user")
          .eq("id", result.id);
        check(lockError);
      }
    return data;
  }
  const workspace = ["category", "section"].includes(request.operation)
    ? await adminSnapshot(user, "content")
    : undefined;
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
          const { data: deleted, error: deletedError } = await db()
            .from("fb_deleted_items")
            .select("auth_locked,purging,purge_after")
            .eq("entity", "user")
            .eq("id", target.id)
            .maybeSingle();
          check(deletedError);
          if (
            !deleted?.auth_locked ||
            deleted.purging ||
            Date.parse(deleted.purge_after) <= Date.now()
          )
            throw new HttpError(
              400,
              "This account is not ready to restore, or its recovery window has ended.",
            );
          const { error: unbanError } = await db().auth.admin.updateUserById(
            target.id,
            { ban_duration: "none" },
          );
          if (unbanError) throw unbanError;
        }
        const { data, error } = await db().rpc("fb_restore_deleted", {
          p_actor: user.id,
          p_entity: request.entity,
          p_id: target.id,
          p_expected: target.expected,
        });
        if (error) throw error;
        results.push({ id: target.id, status: data });
        // Restored users remain inactive; every application entry point checks the fresh profile.
        continue;
      }
      const { data: row, error } = await db()
        .from("fb_documents")
        .select("*")
        .eq("id", target.id)
        .maybeSingle();
      check(error);
      if (!row) throw new HttpError(404, "Content not found.");
      if (request.operation === "publish") {
        if (row.deleted_at)
          throw new HttpError(400, "Restore this item before publishing.");
        if (row.revision !== target.expected)
          throw new HttpError(
            409,
            "This item changed. Reload before retrying.",
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
        const { data, error: writeError } = await db().rpc("fb_bulk_content", {
          p_actor: user.id,
          p_id: target.id,
          p_expected: target.expected,
          p_operation: workspace ? "metadata" : request.operation,
          p_patch: patch,
          p_settings_expected: workspace?.revision ?? null,
        });
        if (writeError) throw writeError;
        results.push({ id: target.id, status: data });
      }
    } catch (error) {
      const known =
        error instanceof HttpError ||
        (error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P0001");
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
