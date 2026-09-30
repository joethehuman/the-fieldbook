import "server-only";
import { revalidateTag } from "next/cache";

// The index and bodies contain only published material. Access, account state,
// installation settings, and relevance are resolved outside this cache.
export const publishedReaderTag = "fieldbook-published-reader-v1";

export function invalidatePublishedReader() {
  // A publish or unpublish must take effect before the next reader request.
  revalidateTag(publishedReaderTag, { expire: 0 });
}
