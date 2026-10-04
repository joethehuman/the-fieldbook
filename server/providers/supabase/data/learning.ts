import "server-only";
import type {
  DataStore,
  GovernanceRecord,
  ProfileRecord,
  ProgressRecord,
  DeletedItemRecord,
} from "../../../ports/data";
import type { Progress } from "@/lib/types";
import { db, check } from "../client";
import { readAll } from "../read-all";
import { HttpError } from "../../../errors";

export const learningData: Pick<
  DataStore,
  | "readGovernanceSnapshot"
  | "readAdminPeopleSnapshot"
  | "listProfiles"
  | "listDeletedRosterProfiles"
  | "readProfileNames"
  | "findOwnerProfile"
  | "saveGovernance"
  | "rosterImportOperation"
  | "manageLearning"
  | "reviewDeadlines"
  | "consumeRateLimit"
  | "readCourseProgress"
  | "listUserProgress"
  | "readLatestCourseProgress"
  | "mergeProgress"
  | "listDeletedItems"
  | "readCleanupStatus"
> = {
  async readAdminPeopleSnapshot(actorId, userId) {
    const { data, error } = await db().rpc("fb_admin_people_snapshot", {
      p_actor: actorId,
      p_user: userId || null,
    });
    check(error);
    return data as GovernanceRecord;
  },
  async readGovernanceSnapshot(actorId) {
    const { data, error } = await db().rpc("fb_governance_snapshot", {
      p_actor: actorId,
    });
    check(error);
    return data as GovernanceRecord;
  },
  async listProfiles() {
    return await readAll<ProfileRecord>((from, to) =>
      db()
        .from("fb_profiles")
        .select("*", { count: "exact" })
        .order("id")
        .range(from, to),
    );
  },
  async readProfileNames(ids) {
    const unique = [...new Set(ids)];
    const names: Pick<ProfileRecord, "id" | "name">[] = [];
    // Keep URLs bounded and each result below the provider's row limit.
    for (let start = 0; start < unique.length; start += 500) {
      const chunks = Array.from(
        { length: Math.ceil(Math.min(500, unique.length - start) / 100) },
        (_, offset) =>
          unique.slice(start + offset * 100, start + (offset + 1) * 100),
      );
      const batch = await Promise.all(
        chunks.map(async (chunk) => {
          const { data, error } = await db()
            .from("fb_profiles")
            .select("id,name")
            .in("id", chunk);
          check(error);
          return (data || []) as Pick<ProfileRecord, "id" | "name">[];
        }),
      );
      names.push(...batch.flat());
    }
    return names;
  },
  async findOwnerProfile(email) {
    const { data, error } = await db()
      .from("fb_profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (error) throw new Error("Owner lookup failed.");
    return data as { id: string } | null;
  },
  async listDeletedRosterProfiles() {
    return await readAll<{
      id: string;
      email: string | null;
      purge_after: string;
      purging: boolean;
      auth_locked: boolean;
    }>((from, to) =>
      db()
        .from("fb_deleted_items")
        .select("id,email,purge_after,purging,auth_locked", { count: "exact" })
        .eq("entity", "user")
        .order("id")
        .range(from, to),
    );
  },
  async rosterImportOperation(actorId, fileHash, run, payload) {
    const { data, error } = await db().rpc("fb_roster_import", {
      p_actor: actorId,
      p_file_hash: fileHash,
      p_run: run || null,
      p_data: payload || null,
    });
    if (error) {
      if (error.message.includes("Administrator"))
        throw new HttpError(
          403,
          "Administrator access changed. Sign in again.",
        );
      if (
        error.message.includes("changed") ||
        error.message.includes("review does not match")
      )
        throw new HttpError(
          409,
          "The organization changed. Review the file again before importing.",
        );
      if (error.code === "P0001") throw new HttpError(400, error.message);
      throw new HttpError(
        503,
        "Import could not be confirmed. Try Import again to check the same operation.",
      );
    }
    return data;
  },
  async saveGovernance(actorId, expected, operation, payload) {
    const { data, error } = await db().rpc("fb_save_governance", {
      p_actor: actorId,
      p_expected: expected,
      p_operation: operation,
      p_data: payload,
    });
    if (error) {
      if (error.message.includes("Revision conflict"))
        throw new HttpError(409, "Governance changed. Reload before saving.");
      if (error.code === "P0001") throw new HttpError(400, error.message);
      throw new Error("Governance save failed.");
    }
    return data as { revision: number };
  },
  async reviewDeadlines(actorId, apply, token) {
    const { data, error } = await db().rpc("fb_review_deadlines", {
      p_actor: actorId,
      p_apply: apply,
      p_token: token || null,
    });
    if (error)
      throw new HttpError(
        error.message.includes("changed") ? 409 : 400,
        error.code === "P0001"
          ? error.message
          : "Deadline review failed. Try again.",
      );
    return data;
  },
  async manageLearning(actorId, payload) {
    const { data, error } = await db().rpc("fb_manage_learning", {
      p_actor: actorId,
      p_data: payload,
    });
    if (error)
      throw new HttpError(
        error.message.includes("changed") ? 409 : 400,
        error.message,
      );
    return data as { ok: true };
  },
  async consumeRateLimit(key, limit, seconds) {
    const { data, error } = await db().rpc("fb_allow_request", {
      p_key: key,
      p_limit: limit,
      p_seconds: seconds,
    });
    check(error);
    return data as boolean;
  },
  async readCourseProgress(userId, contentId, version) {
    const { data, error } = await db()
      .from("fb_progress")
      .select("lessons,passed,attempts")
      .eq("user_id", userId)
      .eq("content_id", contentId)
      .eq("version", version)
      .maybeSingle();
    check(error);
    return data as Pick<
      ProgressRecord,
      "lessons" | "passed" | "attempts"
    > | null;
  },
  async listUserProgress(userId) {
    return await readAll<Progress>((from, to) =>
      db()
        .from("fb_progress")
        .select("content_id,version,lessons,passed,attempts", {
          count: "exact",
        })
        .eq("user_id", userId)
        .order("content_id")
        .range(from, to),
    );
  },
  async readLatestCourseProgress(userId, contentId) {
    const { data, error } = await db()
      .from("fb_progress")
      .select("content_id,version,lessons,passed,attempts")
      .eq("user_id", userId)
      .eq("content_id", contentId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    check(error);
    return data as Progress | null;
  },
  async mergeProgress(userId, contentId, version, lessons, passed, attempt) {
    const { data, error } = await db().rpc("fb_record_progress", {
      p_user: userId,
      p_content: contentId,
      p_version: version,
      p_lessons: lessons,
      p_passed: passed,
      p_attempt: attempt,
    });
    check(error);
    return data as ProgressRecord;
  },
  async listDeletedItems(entity) {
    return await readAll<DeletedItemRecord>((from, to) => {
      const query = db()
        .from("fb_deleted_items")
        .select(
          "entity,id,name,kind,revision,deleted_at,purge_after,deleted_by,purging,error",
          { count: "exact" },
        )
        .order("id")
        .order("entity")
        .range(from, to);
      return entity ? query.eq("entity", entity) : query;
    });
  },
  async readCleanupStatus() {
    const { data, error } = await db()
      .from("fb_cleanup_config")
      .select("endpoint,last_run")
      .eq("id", true)
      .single();
    check(error);
    return data as { endpoint: string | null; last_run: string | null } | null;
  },
};
