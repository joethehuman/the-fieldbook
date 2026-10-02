import type { Content } from "./types";
import { contentSignature } from "./demo-publication";

/** Restore editorial content, retaining the current write revision and learning state. */
export function revertToPublished(
  current: Content,
  published: Content,
  canEditUpdateTeams = true,
): Content {
  if (
    current.id !== published.id ||
    current.kind !== published.kind ||
    !published.publishedRevision
  )
    throw new Error(
      "The published version is unavailable. Your changes remain open.",
    );
  return {
    ...structuredClone(published),
    status: "draft",
    revision: current.revision,
    publishedRevision: published.publishedRevision,
    publishedSignature:
      published.publishedSignature ?? contentSignature(published),
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    feedAt: current.feedAt,
    version: current.version,
    assignments: current.assignments,
    groups: current.kind === "course" ? current.groups : published.groups,
    ...(current.kind === "brief" && !canEditUpdateTeams
      ? { updateTeams: current.updateTeams }
      : {}),
  };
}

/** A lost acknowledgement may have committed. Only retry against a checked saved draft. */
export function resumeDraft(
  current: Content,
  baseline: Content,
  attempted: Content | undefined,
  saved: Content | undefined,
): Content {
  if (!saved) {
    if (baseline.revision)
      throw new Error(
        "This draft is no longer available. Your changes remain open.",
      );
    return { ...current, revision: 0 };
  }
  const signature = contentSignature(saved);
  if (
    saved.id !== current.id ||
    saved.kind !== current.kind ||
    (signature !== contentSignature(baseline) &&
      (!attempted || signature !== contentSignature(attempted)))
  )
    throw new Error(
      "The saved draft changed in another session. Load the saved draft before continuing. Your changes remain open.",
    );
  return {
    ...current,
    revision: saved.revision,
    publishedRevision: saved.publishedRevision,
    publishedSignature: saved.publishedSignature,
    version: saved.version,
    assignments: saved.assignments,
    groups: current.kind === "course" ? saved.groups : current.groups,
    createdAt: saved.createdAt,
    feedAt: saved.feedAt,
  };
}
