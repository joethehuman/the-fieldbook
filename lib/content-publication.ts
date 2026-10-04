import type { Content } from "./types";

/** A choice for one publication request, never persisted in the draft. */
export type PublicationOptions = { renewUpdate?: boolean };

export function publishedUpdateFeedDate(
  published: Content | null | undefined,
  now: string,
  renewUpdate = false,
): string {
  return published && !renewUpdate
    ? published.feedAt || published.updatedAt || published.createdAt || now
    : now;
}
