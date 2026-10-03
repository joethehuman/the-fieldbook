import { teamItems } from "./learning-groups";
import { learningChangeImpact } from "./assignment-audiences";
import type { Workspace } from "./store";
import { organizationParent, organizationTeam } from "./organization-team";
import {
  ancestorIds,
  canParent,
  reportTeamIds,
  groupTeamLinks,
  type Team,
} from "./types";

export function teamPath(id: string, teams: Team[]) {
  return [...ancestorIds(id, teams)]
    .reverse()
    .map((key) => teams.find((team) => team.id === key)?.name || "Unknown team")
    .join(" / ");
}

/** One parent changes; stable team IDs preserve members and learning-group links. */
export function moveTeam(teams: Team[], id: string, parentId: string) {
  const team = teams.find((item) => item.id === id);
  if (team?.system === "organization")
    throw new Error("The Organization team cannot be moved.");
  if (organizationTeam(teams)) parentId = organizationParent(teams, parentId);
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
    .filter(
      (user) => user.active && ["manager", "contributor"].includes(user.role),
    )
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
    learning: learningChangeImpact(data, { ...data, teams: next }),
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
    organization:
      data.teams?.some(
        (team) => team.id === id && team.system === "organization",
      ) || false,
    learning: teamItems(data.teams?.find((t) => t.id === id) || {}),
    members: data.users.filter((user) => user.teamId === id),
    pending: (data.pendingUsers || []).filter((user) => user.teamId === id),
    children: (data.teams || []).filter((team) => team.parentId === id),
    groups: data.groups.filter((group) =>
      groupTeamLinks(group).some((link) => link.teamId === id),
    ),
  };
}

/** Direct users and surviving immediate subteams return to Organization. */
export function deleteTeams(data: Workspace, selected: string[]) {
  const ids = new Set(selected);
  const teams = data.teams || [];
  if (!ids.size || [...ids].some((id) => !teams.some((team) => team.id === id)))
    throw new Error(
      "The selected teams changed. Reload and select them again.",
    );
  const root = organizationTeam(teams, data.settings?.organizationTeamId);
  if (!root)
    throw new Error("Organization changed. Reload before deleting teams.");
  const blocked: string[] = [];
  for (const id of ids) {
    const team = teams.find((team) => team.id === id)!;
    const blockers = teamDeletionBlockers(data, id);
    const reasons = [
      blockers.organization && "Organization cannot be deleted",
      blockers.learning.length && "remove its assigned learning first",
      blockers.groups.length && "remove its learning-group links first",
    ].filter(Boolean);
    if (reasons.length) blocked.push(`${team.name}: ${reasons.join("; ")}.`);
  }
  if (blocked.length) throw new Error(blocked.join("\n"));
  return {
    ...data,
    teams: teams
      .filter((team) => !ids.has(team.id))
      .map((team) =>
        team.parentId && ids.has(team.parentId)
          ? { ...team, parentId: root.id }
          : team,
      ),
    users: data.users.map((user) =>
      user.teamId && ids.has(user.teamId)
        ? { ...user, teamId: undefined }
        : user,
    ),
    ...(data.pendingUsers && {
      pendingUsers: data.pendingUsers.map((user) =>
        user.teamId && ids.has(user.teamId)
          ? { ...user, teamId: undefined }
          : user,
      ),
    }),
  };
}
