import type { Team } from "./types";

/** Presentation designation only: never create, rename or reparent a team. */
export function organizationTeam(
  teams: readonly Team[],
  id?: string | null,
): Team | undefined {
  if (!id) return undefined;
  const roots = teams.filter((team) => !team.parentId);
  return roots.length === 1 && roots[0].id === id ? roots[0] : undefined;
}
