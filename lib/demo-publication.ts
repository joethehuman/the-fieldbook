import type { Workspace } from "./store";
import type { Content } from "./types";
import { isArtworkOnlyUpdate } from "./card-art";

/** Compare author-controlled content, not persistence bookkeeping. */
export function contentSignature(item: Content) {
  const { revision, publishedRevision, updatedAt, status, ...content } = item;
  return JSON.stringify(content, function (key, value) {
    if (value && typeof value === "object" && !Array.isArray(value))
      return Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
      );
    return value;
  });
}

export function hasUnpublishedEdits(item: Content, live?: Content) {
  if (!item.publishedRevision) return false;
  // Published course snapshots intentionally omit quiz answers.
  if (item.kind === "course" || !live)
    return item.publishedRevision !== item.revision;
  return contentSignature(item) !== contentSignature(live);
}

/** Upgrade existing browser work without resetting edits or synthetic profiles. */
export function withPublishedSnapshots(data: Workspace): Workspace {
  if (data.publishedContent) return data;
  return {
    ...data,
    content: data.content.map((item) => ({
      ...item,
      revision: item.revision || 1,
      publishedRevision:
        item.status === "published" ? item.revision || 1 : undefined,
    })),
    publishedContent: structuredClone(
      data.content.filter((item) => item.status === "published"),
    ),
  };
}

/** Match the server's draft/published snapshots. Removal requests unpublish. */
export function reconcileDemoPublication(
  before: Workspace,
  after: Workspace,
): Workspace {
  const source = withPublishedSnapshots(before);
  let published = [...source.publishedContent!];
  const content = after.content.map((item) => {
    const old = source.content.find((entry) => entry.id === item.id);
    if (old && JSON.stringify(item) === JSON.stringify(old)) return item;
    const revision = (old?.revision || 0) + 1;
    const live = published.find((entry) => entry.id === item.id);
    const saved = {
      ...item,
      ...(item.status === "published" && item.kind === "brief" ? { feedAt: live && isArtworkOnlyUpdate(item, live) ? live.feedAt || live.updatedAt : item.updatedAt } : {}),
      revision,
      publishedRevision:
        item.status === "published" ||
        (live && contentSignature(live) === contentSignature(item))
          ? revision
          : old?.publishedRevision,
    };
    if (item.status === "published") {
      published = [
        ...published.filter((entry) => entry.id !== item.id),
        structuredClone(saved),
      ];
    }
    return saved;
  });
  for (const removed of source.content.filter(
    (item) => !after.content.some((entry) => entry.id === item.id),
  )) {
    published = published.filter((entry) => entry.id !== removed.id);
    content.push({
      ...removed,
      status: "draft",
      publishedRevision: undefined,
      revision: (removed.revision || 0) + 1,
    });
  }
  return { ...after, content, publishedContent: published };
}
