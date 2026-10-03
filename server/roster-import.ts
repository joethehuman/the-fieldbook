import "server-only";
import { data } from "./data";
import { document } from "./content";
import { HttpError, profile, requireAdmin } from "./auth";
import type { DataStore } from "./ports/data";
import type { User } from "@/lib/types";
import type { Workspace } from "@/lib/store";
import { ROSTER_IMPORT_MAX_BYTES, reviewRosterCsv } from "@/lib/roster-import";

/** Bounded transient input. Review accepts CSV, never client proposals or IDs. */
export async function readRosterUpload(req: Request): Promise<string> {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(400, "Choose a CSV file to review.");
  const limit = ROSTER_IMPORT_MAX_BYTES * 2 + 2048;
  if (Number(req.headers.get("content-length")) > limit)
    throw new HttpError(413, "Use a CSV smaller than 2 MB.");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Choose a CSV file to review.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let length = 0,
    text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new HttpError(413, "Use a CSV smaller than 2 MB.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body = JSON.parse(text);
    if (!body || typeof body.csv !== "string" || Object.keys(body).length !== 1)
      throw new Error("Invalid CSV body");
    if (new TextEncoder().encode(body.csv).byteLength > ROSTER_IMPORT_MAX_BYTES)
      throw new HttpError(413, "Use a CSV smaller than 2 MB.");
    return body.csv;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Choose a valid UTF-8 CSV file to review.");
  } finally {
    reader.releaseLock();
  }
}

/** Existing read ports only. No Auth registration, roster save or audit write. */
export async function rosterImportReview(
  user: User | null,
  csv: string,
  store: DataStore = data(),
) {
  requireAdmin(user);
  const [config, snapshot, published, profiles] = await Promise.all([
    store.readConfiguration(),
    store.readAdminPeopleSnapshot(user.id),
    store.listPublishedAssignmentContent(),
    store.listProfiles(),
  ]);
  const current = snapshot.users.find((p) => p.id === user.id);
  if (!current || !current.active || current.role !== "admin")
    throw new HttpError(403, "Administrator access changed. Sign in again.");
  const latest = await store.readConfiguration();
  if (
    config.governance_revision !== snapshot.revision ||
    latest.governance_revision !== snapshot.revision ||
    latest.revision !== config.revision
  )
    throw new HttpError(
      409,
      "The organization changed while reviewing. Review the file again.",
    );
  const content = published.map((row) => document(row));
  const workspace: Workspace = {
    schema: 1,
    settings: config.settings,
    revision: config.revision,
    governanceRevision: snapshot.revision,
    users: snapshot.users.map(profile),
    teams: snapshot.teams,
    groups: snapshot.groups,
    curricula: snapshot.curricula || [],
    content,
    publishedContent: content,
    progress: {},
    feedback: [],
  };
  return reviewRosterCsv(csv, workspace, {
    deletedEmails: profiles.filter((p) => p.deleted_at).map((p) => p.email),
  });
}
