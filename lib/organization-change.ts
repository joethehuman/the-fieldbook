import type { Workspace } from "./store";
import { assignmentImpact, reportingImpact } from "./assignment-episodes";
import { effectiveGroups, type Content } from "./types";
import { expandLearning, groupItems } from "./learning-groups";

/** Context for the one review preceding an organization save. Never an authorization bypass. */
export type OrganizationChangeOptions = {
  locallyHandled?: boolean;
  review?: {
    title?: string;
    description?: string;
    confirmLabel?: string;
    /** Destructive changes still require confirmation when there are no assignment effects. */
    always?: boolean;
  };
};

export class OrganizationChangeCanceledError extends Error {
  constructor() {
    super("Change canceled. Nothing saved.");
    this.name = "OrganizationChangeCanceledError";
  }
}
export function isOrganizationChangeCanceled(error: unknown): boolean {
  return error instanceof OrganizationChangeCanceledError;
}

export function organizationChangeSummary(before: Workspace, after: Workspace) {
  const assignments = assignmentImpact(before, after);
  const reporting = reportingImpact(before, after);
  const updates = after.users
    .filter((person) => person.active)
    .map((person) => {
      const previous = before.users.find((p) => p.id === person.id);
      const relevant = (workspace: Workspace, user = person) => {
        const memberships = effectiveGroups(
          user,
          workspace.groups,
          workspace.teams || [],
        );
        return (workspace.publishedContent || workspace.content).filter(
          (c) =>
            c.kind === "brief" &&
            c.status === "published" &&
            c.groups.some((id) => memberships.has(id)),
        );
      };
      const was = previous ? relevant(before, previous) : [],
        now = relevant(after);
      return {
        person,
        gained: now.filter((c) => !was.some((old) => old.id === c.id)),
        lost: was.filter((c) => !now.some((next) => next.id === c.id)),
      };
    })
    .filter((row) => row.gained.length || row.lost.length);
  const guestItems = (workspace: Workspace) => {
    if (workspace.settings?.access !== "public") return [];
    const selected = workspace.groups.find(
      (g) => g.id === workspace.settings?.guestGroupId,
    );
    if (!selected) return [];
    const published = workspace.publishedContent || workspace.content;
    const courses = new Set(
      expandLearning(
        groupItems(selected, published),
        workspace.curricula || [],
      ),
    );
    return published.filter(
      (c) =>
        c.status === "published" &&
        (c.kind === "course"
          ? courses.has(c.id)
          : c.kind === "brief" && c.groups.includes(selected.id)),
    );
  };
  const wasGuest = guestItems(before),
    nowGuest = guestItems(after);
  const guest = {
    gained: nowGuest.filter((c) => !wasGuest.some((old) => old.id === c.id)),
    lost: wasGuest.filter((c) => !nowGuest.some((next) => next.id === c.id)),
  };
  const unique = (items: Content[]) =>
    new Map(items.map((c) => [c.id, c])).size;
  return {
    assignments,
    reporting,
    updates,
    guest,
    peopleGaining: assignments.filter((r) => r.gained.length).length,
    peopleLosing: assignments.filter((r) => r.lost.length).length,
    coursesGained: unique(assignments.flatMap((r) => r.gained)),
    coursesLost: unique(assignments.flatMap((r) => r.lost)),
    changed: !!(
      assignments.length ||
      reporting.length ||
      updates.length ||
      guest.gained.length ||
      guest.lost.length
    ),
  };
}
