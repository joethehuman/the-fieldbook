import type { Workspace } from "./store";
import { ancestorIds, canParent, reportTeamIds, type Team } from "./types";

export function teamPath(id: string, teams: Team[]) {
  return [...ancestorIds(id, teams)]
    .reverse()
    .map((key) => teams.find((team) => team.id === key)?.name || "Unknown team")
    .join(" / ");
}

/** One parent changes; stable team IDs preserve members and learning-group links. */
export function moveTeam(teams: Team[], id: string, parentId: string) {
  const team = teams.find((item) => item.id === id);
  if (!team || (parentId && !teams.some((item) => item.id === parentId)))
    throw new Error("The team or destination changed. Choose again.");
  if (!canParent(id, parentId, teams))
    throw new Error("A team cannot sit inside itself or one of its subteams.");
  if ((team.parentId || "") === parentId)
    throw new Error("This team is already in that location.");
  return teams.map((item) =>
    item.id === id ? { ...item, parentId: parentId || undefined } : item,
  );
}

export function teamMoveImpact(data: Workspace, id: string, parentId: string) {
  const teams = data.teams || [];
  const next = moveTeam(teams, id, parentId);
  const branch = teams.filter((team) => ancestorIds(team.id, teams).has(id));
  const ids = new Set(branch.map((team) => team.id));
  const people = data.users.filter(
    (user) => user.teamId && ids.has(user.teamId),
  );
  const managers = data.users
    .filter((user) => user.active && ["manager", "contributor"].includes(user.role))
    .map((manager) => {
      const before = reportTeamIds(manager, teams);
      const after = reportTeamIds(manager, next);
      const gained = [...after].filter((key) => !before.has(key));
      const lost = [...before].filter((key) => !after.has(key));
      const count = (keys: string[]) =>
        data.users.filter(
          (user) => user.active && user.teamId && keys.includes(user.teamId),
        ).length;
      return {
        manager,
        gained,
        lost,
        gainedPeople: count(gained),
        lostPeople: count(lost),
      };
    })
    .filter(({ gained, lost }) => gained.length || lost.length);
  return {
    next,
    branch,
    people,
    managers,
    from: teamPath(id, teams),
    to: teamPath(id, next),
  };
}

/** Include inactive and pending accounts; removing references is a separate save. */
export function teamDeletionBlockers(data: Workspace, id: string) {
  return {
    members: data.users.filter((user) => user.teamId === id),
    pending: (data.pendingUsers || []).filter((user) => user.teamId === id),
    children: (data.teams || []).filter((team) => team.parentId === id),
    groups: data.groups.filter((group) => group.teamIds?.includes(id)),
  };
}
