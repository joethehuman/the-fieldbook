import type { Workspace } from "./store";
import {
  ancestorIds,
  effectiveGroups,
  groupTeamLinks,
  type Group,
  type User,
  type Content,
} from "./types";
import { expandLearning, groupItems } from "./learning-groups";
import { assignmentRules } from "./learning";
import { reconcileAssignments } from "./assignment-episodes";

/** Upgrade saved demo audiences once, before any edits or obligation reconciliation.
 * Team sources remain dynamic. Only individual descendant memberships are copied;
 * future changes to independent groups do not propagate to former ancestors.
 */
export function flattenLearningGroups(data: Workspace): Workspace {
  if (!data.groups.some((g) => g.parentId || g.teamLinkScope)) return data;
  const next = structuredClone(data);
  const legacyGroups = data.groups;
  const ordered = [...legacyGroups].sort(
    (a, b) =>
      ancestorIds(a.id, legacyGroups).size -
        ancestorIds(b.id, legacyGroups).size || a.name.localeCompare(b.name),
  );
  const guestGroup = legacyGroups.find(
    (g) => g.id === data.settings?.guestGroupId,
  );
  const guestAncestors = guestGroup
    ? ancestorIds(guestGroup.id, legacyGroups)
    : new Set<string>();
  next.groups = ordered.map((group) => {
    const { parentId: _parent, teamLinkScope: _scope, ...flat } = group;
    const links = new Map<string, "direct" | "subtree">();
    for (const source of legacyGroups.filter((g) =>
      ancestorIds(g.id, legacyGroups).has(group.id),
    )) {
      for (const { teamId, scope } of groupTeamLinks(source)) {
        if (links.get(teamId) !== "subtree") links.set(teamId, scope);
      }
    }
    const items =
      group.id === guestGroup?.id
        ? ordered
            .filter((g) => guestAncestors.has(g.id))
            .flatMap((g) =>
              groupItems(g, data.publishedContent || data.content),
            )
        : groupItems(group, data.publishedContent || data.content);
    const learningItems = items.filter(
      (item, index) =>
        items.findIndex((i) => i.kind === item.kind && i.id === item.id) ===
        index,
    );
    return {
      ...flat,
      teamIds: [...links]
        .filter(([, scope]) => scope === "subtree")
        .map(([id]) => id),
      legacyDirectTeamIds: [...links]
        .filter(([, scope]) => scope === "direct")
        .map(([id]) => id),
      learningItems,
      requiredCourseIds: expandLearning(learningItems, next.curricula || []),
    };
  });
  const convertUser = (user: User): User => {
    const groups = [
      ...new Set(
        user.groups.flatMap((id) => [...ancestorIds(id, legacyGroups)]),
      ),
    ].filter((id) => next.groups.some((g) => g.id === id));
    const joined = (id: string) =>
      user.effectiveGroupJoinedAt?.[id] ||
      user.groupJoinedAt?.[id] ||
      user.groups
        .filter((g) => ancestorIds(g, legacyGroups).has(id))
        .map((g) => user.groupJoinedAt?.[g])
        .filter((s): s is string => !!s)
        .sort()[0];
    const converted = {
      ...user,
      groups,
      groupJoinedAt: Object.fromEntries(
        groups.flatMap((id) => (joined(id) ? [[id, joined(id)!]] : [])),
      ),
    };
    const memberships = effectiveGroups(
      converted,
      next.groups,
      next.teams || [],
    );
    return {
      ...converted,
      effectiveGroupIds: [...memberships],
      effectiveGroupJoinedAt: Object.fromEntries(
        [...memberships].flatMap((id) =>
          joined(id) ? [[id, joined(id)!]] : [],
        ),
      ),
    };
  };
  next.users = next.users.map(convertUser);
  next.pendingUsers = next.pendingUsers?.map((user) => ({
    ...user,
    groups: [
      ...new Set(
        user.groups.flatMap((id) => [...ancestorIds(id, legacyGroups)]),
      ),
    ],
  }));
  next.deletedItems = next.deletedItems?.map((item) =>
    item.user ? { ...item, user: convertUser(item.user) } : item,
  );

  // A selected guest audience used to receive ancestor recommendations. Make
  // those existing choices explicit in that one audience; no guest account or
  // automatic all-people source is created, and other groups keep their plans.
  const syncGuest = (content: Content[]) =>
    content.map((item) => {
      if (!guestGroup || guestAncestors.size < 2) return item;
      if (
        item.kind === "brief" &&
        item.groups.some((id) => guestAncestors.has(id))
      )
        return {
          ...item,
          groups: [...new Set([...item.groups, guestGroup.id])],
        };
      if (
        item.kind !== "course" ||
        !next.groups
          .find((g) => g.id === guestGroup.id)
          ?.requiredCourseIds?.includes(item.id)
      )
        return item;
      const rules = assignmentRules(item);
      if (rules.some((a) => a.groupId === guestGroup.id)) return item;
      const assignedAt =
        rules
          .filter((a) => a.groupId && guestAncestors.has(a.groupId))
          .map((a) => a.assignedAt)
          .sort()[0] ||
        item.createdAt ||
        item.updatedAt;
      return {
        ...item,
        groups: [...new Set([...item.groups, guestGroup.id])],
        assignments: [
          ...rules,
          {
            groupId: guestGroup.id,
            assignedAt,
            due: { type: "none" as const },
          },
        ],
      };
    });
  next.content = syncGuest(next.content);
  if (next.publishedContent)
    next.publishedContent = syncGuest(next.publishedContent);
  next.users = reconcileAssignments(data, next, new Date().toISOString(), true);
  return next;
}
