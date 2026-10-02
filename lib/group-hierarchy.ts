import type { Workspace } from "./store";
import { ancestorIds, groupTeamLinks, type Group, type User } from "./types";
import { teamPath } from "./team-hierarchy";

export function groupPath(id: string, groups: Group[]) {
  return groups.find((group) => group.id === id)?.name || "Unknown group";
}

export function groupMembershipSources(
  user: User,
  targetId: string,
  data: Workspace,
) {
  const sources: string[] = [];
  for (const id of user.groups) {
    if (id === targetId) sources.push("Individually added");
  }
  if (user.teamId) {
    const group = data.groups.find((g) => g.id === targetId);
    const ancestors = ancestorIds(user.teamId, data.teams || []);
    for (const link of group ? groupTeamLinks(group) : []) {
      if (
        link.teamId === user.teamId ||
        (link.scope === "subtree" && ancestors.has(link.teamId))
      )
        sources.push(
          `${teamPath(link.teamId, data.teams || [])} (${link.scope === "subtree" ? "includes subteams" : "direct members only"})`,
        );
    }
  }
  return [...new Set(sources)];
}
