import type { Team } from "./types";
import type { Workspace } from "./store";
import { defaultSettings } from "./settings";

/** The system root is an actual team; it has ordinary direct members and manager scope. */
export function organizationTeam(
  teams: readonly Team[],
  id?: string | null,
): Team | undefined {
  const marked = teams.filter((team) => team.system === "organization");
  if (marked.length !== 1) return undefined;
  const root = marked[0];
  if (root.parentId || (id && root.id !== id)) return undefined;
  if (teams.some((team) => team.id !== root.id && !team.parentId))
    return undefined;
  return root;
}

/** Empty parent choices mean the Organization root, never a second top-level team. */
export function organizationParent(teams: readonly Team[], parentId?: string) {
  if (parentId) return parentId;
  const root = organizationTeam(teams);
  if (!root)
    throw new Error(
      "Organization team setup is incomplete. Reload before saving.",
    );
  return root.id;
}

/** Shared structural checks; a manager change is allowed, identity and structure are fixed. */
export function validateOrganizationTeams(
  teams: readonly Team[],
  id?: string | null,
  previousTeams?: readonly Team[],
  previousId?: string | null,
) {
  const root = organizationTeam(teams, id);
  if (!root || !id || root.id !== id)
    throw new Error(
      "Keep the built-in Organization team as the only top-level team.",
    );
  if (previousTeams) {
    const previous = organizationTeam(previousTeams, previousId);
    if (
      !previous ||
      previous.id !== previousId ||
      previous.id !== root.id ||
      previous.name !== root.name
    )
      throw new Error(
        "The Organization team cannot be deleted, renamed or replaced.",
      );
  }
  const nodes = new Map(teams.map((team) => [team.id, team]));
  if (nodes.size !== teams.length) throw new Error("Use unique team IDs.");
  for (const team of teams) {
    const seen = new Set<string>();
    let current: Team | undefined = team;
    while (current && current.id !== root.id) {
      if (seen.has(current.id))
        throw new Error("Hierarchy cannot contain a cycle.");
      seen.add(current.id);
      current = current.parentId ? nodes.get(current.parentId) : undefined;
    }
    if (!current) throw new Error("Every team must sit inside Organization.");
  }
}

/** One-time saved-demo conversion. No user or learning records are changed. */
export function withOrganizationTeam(data: Workspace): Workspace {
  const teams = data.teams || [];
  const selected = data.settings?.organizationTeamId;
  const existing = organizationTeam(teams, selected);
  if (existing && selected === existing.id) {
    validateOrganizationTeams(teams, selected);
    return data;
  }
  if (teams.some((team) => team.system === "organization"))
    throw new Error(
      "Saved Organization team is inconsistent. Export the demo before repairing it.",
    );
  const roots = teams.filter((team) => !team.parentId);
  const preserved =
    roots.length === 1 && roots[0].id === selected ? roots[0] : undefined;
  let id = preserved?.id || "fieldbook-organization";
  let name = preserved?.name || "Organization";
  if (!preserved) {
    for (let suffix = 2; teams.some((team) => team.id === id); suffix++)
      id = `fieldbook-organization-${suffix}`;
    for (
      let suffix = 2;
      teams.some(
        (team) => team.name.trim().toLowerCase() === name.toLowerCase(),
      );
      suffix++
    )
      name = `Organization (${suffix})`;
  }
  const root: Team = { ...(preserved || { id, name }), system: "organization" };
  const next: Workspace = {
    ...data,
    settings: { ...defaultSettings, ...data.settings, organizationTeamId: id },
    teams: [
      root,
      ...teams
        .filter((team) => team.id !== id)
        .map((team) => (team.parentId ? team : { ...team, parentId: id })),
    ],
  };
  validateOrganizationTeams(next.teams!, id);
  return next;
}
