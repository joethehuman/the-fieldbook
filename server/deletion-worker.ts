import "server-only";
import { cleanupData } from "./cleanup-data";
import { lockIdentity, deleteIdentity } from "./identity";
import { storage } from "./storage";
import { HttpError } from "./errors";

export async function purgeDeleted(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret))
    throw new HttpError(401, "Invalid worker credential.");
  const items = await cleanupData().claimDeletions(secret);
  let removed = 0,
    failed = 0;
  for (const item of items) {
    try {
      if (item.entity === "user" && !item.purging) {
        await lockIdentity(item.id);
        await cleanupData().recordIdentityLock(item.id, true, null, item.claim);
        continue;
      }
      if (item.entity === "user") await deleteIdentity(item.id);
      await cleanupData().finishDeletion(item);
      removed++;
    } catch {
      failed++;
      await cleanupData().recordFailure(
        item,
        "Cleanup failed; scheduled retry pending.",
      );
    }
  }
  const media = await cleanupData().collectMedia();
  for (const asset of media) {
    // The adapter deletes through the supported storage API before DB metadata.
    try {
      await storage().remove(asset.path);
    } catch {
      failed++;
      continue;
    }
    await cleanupData().finishMedia(asset.id);
  }
  return { removed, failed };
}
