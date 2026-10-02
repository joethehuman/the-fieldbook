import type { Workspace } from "./store";
import { ancestorIds, canParent, effectiveGroups, type Group, type User } from "./types";
import { expandLearning, groupItems } from "./learning-groups";
import { teamPath } from "./team-hierarchy";

export function groupPath(id: string, groups: Group[]) {
  return [...ancestorIds(id, groups)]
    .reverse()
    .map((key) => groups.find((group) => group.id === key)?.name || "Unknown group")
    .join(" / ");
}

export function groupMembershipSources(user: User, targetId: string, data: Workspace) {
  const sources: string[] = [];
  for (const id of user.groups) {
    if (!ancestorIds(id, data.groups).has(targetId)) continue;
    sources.push(id === targetId ? "Directly added" : `Via child group ${groupPath(id, data.groups)}`);
  }
  if (user.teamId) {
    for (const group of data.groups) {
      if (group.teamIds?.some((id) => id === user.teamId || (group.teamLinkScope !== "direct" && ancestorIds(user.teamId!, data.teams || []).has(id))) && ancestorIds(group.id, data.groups).has(targetId)) {
        const source = `Via team ${teamPath(user.teamId, data.teams || [])}`;
        sources.push(group.id === targetId ? source : `${source} linked to ${groupPath(group.id, data.groups)}`);
      }
    }
  }
  return [...new Set(sources)];
}

/** A move changes one parent and keeps the branch's stable IDs. */
export function moveGroup(groups: Group[], id: string, parentId?: string) {
  const group = groups.find((item) => item.id === id);
  if (!group || (parentId && !groups.some((item) => item.id === parentId)))
    throw new Error("The group or destination changed. Choose again.");
  if (!canParent(id, parentId || "", groups))
    throw new Error("A group cannot move inside itself or a child group.");
  if ((group.parentId || "") === (parentId || ""))
    throw new Error("This group is already in that location.");
  return groups.map((item) => item.id === id ? { ...item, parentId } : item);
}

export function groupMoveImpact(data: Workspace, id: string, parentId?: string) {
  const next = moveGroup(data.groups, id, parentId);
  const content = data.publishedContent || data.content;
  const published = content.filter((item) => item.status === "published");
  const curricula = data.curricula || [];
  const publishedCourseIds = new Set(published.filter((item) => item.kind === "course").map((item) => item.id));
  const offered = (memberships: Set<string>) => ({
    courses: new Set([...memberships].flatMap((groupId) => {
      const group = data.groups.find((item) => item.id === groupId);
      return group ? expandLearning(groupItems(group, content), curricula).filter((course) => publishedCourseIds.has(course)) : [];
    })),
    updates: new Set(published.filter((item) => item.kind === "brief" && item.groups.some((groupId) => memberships.has(groupId))).map((item) => item.id)),
  });
  let gainedMembers = 0, lostMembers = 0, gainedCourses = 0, lostCourses = 0, gainedUpdates = 0, lostUpdates = 0;
  for (const user of data.users) {
    const before = effectiveGroups(user, data.groups, data.teams || []);
    const after = effectiveGroups(user, next, data.teams || []);
    if ([...after].some((groupId) => !before.has(groupId))) gainedMembers++;
    if ([...before].some((groupId) => !after.has(groupId))) lostMembers++;
    const old = offered(before), fresh = offered(after);
    gainedCourses += [...fresh.courses].filter((course) => !old.courses.has(course)).length;
    lostCourses += [...old.courses].filter((course) => !fresh.courses.has(course)).length;
    gainedUpdates += [...fresh.updates].filter((update) => !old.updates.has(update)).length;
    lostUpdates += [...old.updates].filter((update) => !fresh.updates.has(update)).length;
  }
  const guestGroupId = data.settings?.guestGroupId;
  const guestBefore = guestGroupId ? offered(ancestorIds(guestGroupId, data.groups)) : null;
  const guestAfter = guestGroupId ? offered(ancestorIds(guestGroupId, next)) : null;
  const guest = guestBefore && guestAfter ? {
    gainedCourses: [...guestAfter.courses].filter((course) => !guestBefore.courses.has(course)).length,
    lostCourses: [...guestBefore.courses].filter((course) => !guestAfter.courses.has(course)).length,
    gainedUpdates: [...guestAfter.updates].filter((update) => !guestBefore.updates.has(update)).length,
    lostUpdates: [...guestBefore.updates].filter((update) => !guestAfter.updates.has(update)).length,
  } : null;
  return {
    next,
    from: groupPath(id, data.groups),
    to: groupPath(id, next),
    branch: data.groups.filter((group) => ancestorIds(group.id, data.groups).has(id)),
    gainedMembers, lostMembers, gainedCourses, lostCourses, gainedUpdates, lostUpdates, guest,
  };
}
