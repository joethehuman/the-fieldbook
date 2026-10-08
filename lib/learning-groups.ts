import type { Workspace } from "./store";
import {
  effectiveGroups,
  type Content,
  type Assignment,
  type Group,
  type Curriculum,
  type LearningItem,
  type Team,
} from "./types";
import { updateMatchesAudience } from "./content-audiences";
import { reconcileAssignments } from "./assignment-episodes";
import { assignmentRules } from "./learning";

export function groupItems(group: Group, content: Content[]): LearningItem[] {
  if (group.learningItems) return group.learningItems;
  const assigned = content.filter(
    (c) =>
      c.kind === "course" &&
      assignmentRules(c).some((a) => a.groupId === group.id),
  );
  const order = group.requiredCourseIds || [];
  return assigned
    .sort(
      (a, b) =>
        (order.indexOf(a.id) < 0 ? 99999 : order.indexOf(a.id)) -
          (order.indexOf(b.id) < 0 ? 99999 : order.indexOf(b.id)) ||
        a.title.localeCompare(b.title),
    )
    .map((c) => ({ kind: "course", id: c.id }));
}
/** Preserve older direct Team course plans until they are normalized on save. */
export function teamItems(
  team: Pick<Team, "learningItems" | "requiredCourseIds">,
): LearningItem[] {
  return (
    team.learningItems ??
    (team.requiredCourseIds || []).map((id) => ({ kind: "course", id }))
  );
}
export function expandLearning(
  items: LearningItem[],
  curricula: Curriculum[],
): string[] {
  return [
    ...new Set(
      items.flatMap((item) =>
        item.kind === "course"
          ? [item.id]
          : curricula.find((c) => c.id === item.id && c.status === "published")
              ?.courseIds || [],
      ),
    ),
  ];
}
export function updateFeedTimestamp(
  item: Pick<Content, "feedAt" | "updatedAt" | "createdAt">,
): number | undefined {
  const parse = (value?: string) => {
    if (!value) return undefined;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : undefined;
  };
  // The published snapshot's updatedAt is unchanged by draft-only edits. A
  // first-publication timestamp is not part of the current content model.
  return parse(item.feedAt) ?? parse(item.updatedAt) ?? parse(item.createdAt);
}
type UpdateFeedItem = Pick<
  Content,
  | "id"
  | "kind"
  | "status"
  | "groups"
  | "updateTeams"
  | "feedAt"
  | "updatedAt"
  | "createdAt"
>;
export function updatesForUser<T extends UpdateFeedItem>(
  content: readonly T[],
  user: Workspace["users"][number],
  groups: Group[],
  teams: Team[] = [],
) {
  const updatesById = new Map<string, T>();
  for (const item of content) {
    if (
      item.kind === "brief" &&
      item.status === "published" &&
      !updatesById.has(item.id)
    )
      updatesById.set(item.id, item);
  }
  const updates = [...updatesById.values()].sort((a, b) => {
    const aTime = updateFeedTimestamp(a);
    const bTime = updateFeedTimestamp(b);
    if (aTime !== undefined && bTime !== undefined)
      return bTime - aTime || a.id.localeCompare(b.id);
    if (aTime !== undefined) return -1;
    if (bTime !== undefined) return 1;
    return a.id.localeCompare(b.id);
  });
  const matches = (c: T) =>
    updateMatchesAudience(
      { groups: c.groups || [], updateTeams: c.updateTeams },
      user,
      groups,
      teams,
    );
  const featured = updates.filter(matches).slice(0, 2);
  const featuredIds = new Set(featured.map((item) => item.id));
  return {
    forYou: featured,
    other: updates.filter((item) => !featuredIds.has(item.id)),
  };
}
// Browser demo mirrors the server's atomic membership and assignment reconciliation.
export function reconcileLearning(
  before: Workspace,
  after: Workspace,
  stamp = new Date().toISOString(),
): Workspace {
  const next = structuredClone(after);
  next.curricula ||= [];
  next.groups = next.groups.map((g) => ({
    ...g,
    learningItems: groupItems(g, before.publishedContent || before.content),
  }));
  next.groups = next.groups.map((g) => ({
    ...g,
    requiredCourseIds: expandLearning(g.learningItems!, next.curricula!),
  }));
  next.teams = (next.teams || []).map((t) => ({
    ...t,
    learningItems: teamItems(t),
    requiredCourseIds: expandLearning(teamItems(t), next.curricula!),
  }));
  next.users = next.users.map((u) => {
    const old = before.users.find((p) => p.id === u.id);
    const was = old
      ? effectiveGroups(old, before.groups, before.teams || [])
      : new Set<string>();
    return {
      ...u,
      onboardingDays:
        u.hireDate || u.onboardingStart
          ? (u.onboardingDays ?? next.settings?.onboardingDays ?? 90)
          : undefined,
      groupJoinedAt: Object.fromEntries(
        u.groups.map((id) => [
          id,
          old?.groups.includes(id) ? old.groupJoinedAt?.[id] || stamp : stamp,
        ]),
      ),
      effectiveGroupIds: undefined,
      effectiveGroupJoinedAt: Object.fromEntries(
        [...effectiveGroups(u, next.groups, next.teams || [])].map((id) => [
          id,
          was.has(id)
            ? old?.effectiveGroupJoinedAt?.[id] ||
              old?.groupJoinedAt?.[id] ||
              "1970-01-01T00:00:00.000Z"
            : stamp,
        ]),
      ),
    };
  });
  const sync = (c: Content) => {
    if (c.kind !== "course")
      return {
        ...c,
        groups:
          c.kind === "doc"
            ? []
            : c.groups.filter((id) => next.groups.some((g) => g.id === id)),
        assignments: [],
      };
    const prior = before.content.find((x) => x.id === c.id);
    const audiences = [
      ...next.groups.map((g) => ({
        groupId: g.id,
        teamId: undefined,
        ids: g.requiredCourseIds,
      })),
      ...(next.teams || []).map((t) => ({
        groupId: undefined,
        teamId: t.id,
        ids: t.requiredCourseIds,
      })),
    ];
    const assignments: Assignment[] = audiences
      .filter((a) => a.ids?.includes(c.id))
      .map((audience) => ({
        ...(audience.groupId
          ? { groupId: audience.groupId }
          : { teamId: audience.teamId }),
        due: { type: "none" as const },
        assignedAt:
          prior?.version === c.version
            ? assignmentRules(prior).find(
                (a) =>
                  a.groupId === audience.groupId &&
                  a.teamId === audience.teamId,
              )?.assignedAt || stamp
            : stamp,
      }));
    return {
      ...c,
      assignments,
      groups: assignments.flatMap((a) => (a.groupId ? [a.groupId] : [])),
    };
  };
  next.pendingUsers = next.pendingUsers?.map((p) => ({
    ...p,
    groups: p.groups.filter((id) => next.groups.some((g) => g.id === id)),
  }));
  next.content = next.content.map(sync);
  if (next.publishedContent)
    next.publishedContent = next.publishedContent.map(sync);
  next.users = reconcileAssignments(
    before,
    next,
    stamp,
    before.users.every((u) => !u.learningAssignments),
  );
  return next;
}
