import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { data } from "./data";
import { document } from "./content";
import { HttpError, profile, requireAdmin } from "./auth";
import type { DataStore } from "./ports/data";
import type { User } from "@/lib/types";
import type { Workspace } from "@/lib/store";
import {
  ROSTER_IMPORT_MAX_BYTES,
  prepareRosterCsv,
  materializeRoster,
} from "@/lib/roster-import";
import { governanceSchema } from "./governance-schema";

/** Bounded transient input. Review accepts CSV, never client proposals or IDs. */
async function readRosterBody(
  req: Request,
  apply = false,
): Promise<{ csv: string; token?: string }> {
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
    if (
      !body ||
      typeof body.csv !== "string" ||
      Object.keys(body).some(
        (key) => !["csv", ...(apply ? ["token"] : [])].includes(key),
      ) ||
      (apply &&
        (typeof body.token !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            body.token,
          )))
    )
      throw new Error("Invalid CSV body");
    if (new TextEncoder().encode(body.csv).byteLength > ROSTER_IMPORT_MAX_BYTES)
      throw new HttpError(413, "Use a CSV smaller than 2 MB.");
    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Choose a valid UTF-8 CSV file to review.");
  } finally {
    reader.releaseLock();
  }
}
export async function readRosterUpload(req: Request) {
  return (await readRosterBody(req)).csv;
}
export async function readRosterApply(req: Request) {
  const body = await readRosterBody(req, true);
  return { csv: body.csv, token: body.token! };
}

/** Existing read ports only. No Auth registration, roster save or audit write. */
async function prepare(
  user: User | null,
  csv: string,
  store: DataStore,
  stamp?: string,
) {
  requireAdmin(user);
  const [config, snapshot, published, profiles, deletedEmails] =
    await Promise.all([
      store.readConfiguration(),
      store.readAdminPeopleSnapshot(user.id),
      store.listPublishedAssignmentContent(),
      store.listProfiles(),
      store.listDeletedProfileEmails(),
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
  return prepareRosterCsv(csv, workspace, {
    stamp,
    deletedEmails: [
      ...deletedEmails,
      ...profiles.filter((p) => p.deleted_at).map((p) => p.email),
    ],
  });
}
const fileHash = (csv: string) =>
  createHash("sha256").update(csv).digest("hex");
/** Read-only model boundary, also used by focused provider tests. */
export async function rosterImportReview(
  user: User | null,
  csv: string,
  store: DataStore = data(),
) {
  return (await prepare(user, csv, store)).review;
}
/** Issue an opaque operation receipt, storing hashes only; no roster changes. */
export async function reviewRosterImport(
  user: User | null,
  csv: string,
  store: DataStore = data(),
) {
  requireAdmin(user);
  const operation = await store.rosterImportOperation(user.id, fileHash(csv));
  const { review } = await prepare(
    user,
    csv,
    store,
    operation.day + "T12:00:00.000Z",
  );
  await store.rosterImportOperation(user.id, fileHash(csv), operation.id);
  return { ...review, token: operation.id };
}
export async function applyRosterImport(
  user: User | null,
  csv: string,
  token: string,
  store: DataStore = data(),
) {
  requireAdmin(user);
  const hash = fileHash(csv);
  const operation = await store.rosterImportOperation(user.id, hash, token);
  if (operation.result) return operation.result;
  const { review, proposal } = await prepare(
    user,
    csv,
    store,
    operation.day + "T12:00:00.000Z",
  );
  if (!review.valid || !proposal)
    throw new HttpError(
      400,
      "Fix every blocking issue and review the file again before importing.",
    );
  const materialized = materializeRoster(proposal, review, randomUUID);
  const payload = {
    expected: proposal.governanceRevision!,
    users: materialized.users.map(
      ({
        id,
        name,
        email,
        role,
        active,
        groups,
        teamId,
        hireDate,
        onboardingStart,
      }) => ({
        id,
        name,
        email,
        role,
        active,
        groups,
        teamId,
        hireDate,
        onboardingStart,
      }),
    ),
    teams: materialized.teams || [],
    groups: proposal.groups,
    curricula: proposal.curricula,
  };
  // Validate, but retain the stored assignment metadata that the regular edit schema omits.
  if (!governanceSchema.safeParse(payload).success)
    throw new HttpError(
      400,
      "The roster could not be validated. Review the file and existing organization settings.",
    );
  await store.rosterImportOperation(user.id, hash, token, {
    users: payload.users,
    teams: payload.teams,
  });
  const committed = await store.rosterImportOperation(user.id, hash, token);
  if (!committed.result)
    throw new HttpError(
      503,
      "Import could not be confirmed. Try Import again to check the same operation.",
    );
  return committed.result;
}
