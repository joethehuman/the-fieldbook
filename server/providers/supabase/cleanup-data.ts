import "server-only";
import type { CleanupDataPort } from "../../ports/cleanup-data";
import { HttpError } from "../../errors";
import { db, check } from "./client";

function checkMutation(error: { code?: string; message: string } | null) {
  // These existing SQL functions expose per-item validation messages to admins.
  if (error?.code === "P0001") throw new HttpError(400, error.message);
  check(error);
}

export const supabaseCleanupData: CleanupDataPort = {
  async deleteUsers(input) {
    const { data, error } = await db().rpc("fb_delete_users", {
      p_actor: input.actor,
      p_expected: input.expected,
      p_ids: input.ids,
      p_owner: input.owner,
    });
    check(error);
    return data;
  },
  async recordIdentityLock(id, locked, error, claim) {
    let query = db()
      .from("fb_deleted_items")
      .update(locked ? { auth_locked: true, error } : { error })
      .eq("entity", "user")
      .eq("id", id);
    if (claim) query = query.eq("claim", claim);
    const { error: writeError } = await query;
    check(writeError);
  },
  async recoveryState(id) {
    const { data, error } = await db()
      .from("fb_deleted_items")
      .select("auth_locked,purging,purge_after")
      .eq("entity", "user")
      .eq("id", id)
      .maybeSingle();
    check(error);
    return data
      ? {
          authLocked: data.auth_locked,
          purging: data.purging,
          purgeAfter: data.purge_after,
        }
      : null;
  },
  async restore(input) {
    const { data, error } = await db().rpc("fb_restore_deleted", {
      p_actor: input.actor,
      p_entity: input.entity,
      p_id: input.id,
      p_expected: input.expected,
    });
    checkMutation(error);
    return data;
  },
  async mutateContent(input) {
    const { data, error } = await db().rpc("fb_bulk_content", {
      p_actor: input.actor,
      p_id: input.id,
      p_expected: input.expected,
      p_operation: input.operation,
      p_patch: input.patch,
      p_settings_expected: input.settingsExpected,
    });
    checkMutation(error);
    return data;
  },
  async claimDeletions(secret) {
    const { data, error } = await db().rpc("fb_claim_deletions", {
      p_secret: secret,
    });
    if (error?.code === "P0001")
      throw new HttpError(401, "Invalid worker credential.");
    check(error);
    return data || [];
  },
  async finishDeletion(item) {
    const { error } = await db().rpc("fb_finish_deletion", {
      p_entity: item.entity,
      p_id: item.id,
      p_claim: item.claim,
    });
    check(error);
  },
  async recordFailure(item, message) {
    const { error } = await db()
      .from("fb_deleted_items")
      .update({ error: message })
      .eq("entity", item.entity)
      .eq("id", item.id)
      .eq("claim", item.claim);
    check(error);
  },
  async collectMedia() {
    const { data, error } = await db().rpc("fb_collect_deleted_media");
    check(error);
    return data || [];
  },
  async finishMedia(id) {
    const { error: metadataError } = await db()
      .from("fb_media")
      .delete()
      .eq("id", id)
      .eq("ready", false);
    check(metadataError);
    const { error: queueError } = await db()
      .from("fb_media_cleanup")
      .delete()
      .eq("id", id);
    check(queueError);
  },
};
