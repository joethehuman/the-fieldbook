import "server-only";
import { db, check } from "./db";
import { HttpError } from "./errors";

export async function purgeDeleted(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret))
    throw new HttpError(401, "Invalid worker credential.");
  const client = db();
  const { data: items, error } = await client.rpc("fb_claim_deletions", {
    p_secret: secret,
  });
  if (error?.code === "P0001")
    throw new HttpError(401, "Invalid worker credential.");
  check(error);
  let removed = 0,
    failed = 0;
  for (const item of items || []) {
    try {
      if (item.entity === "user" && !item.purging) {
        const { error: banError } = await client.auth.admin.updateUserById(
          item.id,
          { ban_duration: "876600h" },
        );
        if (banError) throw banError;
        const { error: lockError } = await client
          .from("fb_deleted_items")
          .update({ auth_locked: true, error: null })
          .eq("entity", "user")
          .eq("id", item.id)
          .eq("claim", item.claim);
        check(lockError);
        continue;
      }
      if (item.entity === "user") {
        const { error: authError } = await client.auth.admin.deleteUser(
          item.id,
        );
        if (authError && authError.code !== "user_not_found") throw authError;
      }
      const { error: finishError } = await client.rpc("fb_finish_deletion", {
        p_entity: item.entity,
        p_id: item.id,
        p_claim: item.claim,
      });
      check(finishError);
      removed++;
    } catch {
      failed++;
      const { error: recordError } = await client
        .from("fb_deleted_items")
        .update({ error: "Cleanup failed; scheduled retry pending." })
        .eq("entity", item.entity)
        .eq("id", item.id)
        .eq("claim", item.claim);
      check(recordError);
    }
  }
  const { data: media, error: mediaError } = await client.rpc(
    "fb_collect_deleted_media",
  );
  check(mediaError);
  for (const asset of media || []) {
    // Storage operations go through its supported API, never SQL deletion of storage.objects.
    const { error: storageError } = await client.storage
      .from("fieldbook-media")
      .remove([asset.path]);
    if (storageError) {
      failed++;
      continue;
    }
    const { error: metadataError } = await client
      .from("fb_media")
      .delete()
      .eq("id", asset.id)
      .eq("ready", false);
    check(metadataError);
    const { error: queueError } = await client
      .from("fb_media_cleanup")
      .delete()
      .eq("id", asset.id);
    check(queueError);
  }
  return { removed, failed };
}
