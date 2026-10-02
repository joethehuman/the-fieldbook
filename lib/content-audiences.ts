import type { Workspace } from "./store";
import {
  ancestorIds,
  effectiveGroups,
  reportingTeamId,
  type AssignmentAudience,
  type Content,
  type Team,
  type User,
  type Group,
} from "./types";

export type AudienceOption = AssignmentAudience & {
  name: string;
  organization?: boolean;
  publicGuests?: boolean;
};
export const contentAudienceKey = (a: AssignmentAudience) =>
  `${a.kind}:${a.id}`;
export function audienceOptions(data: Workspace): AudienceOption[] {
  return [
    ...data.groups.map((g) => ({
      kind: "group" as const,
      id: g.id,
      name: g.name,
      publicGuests:
        data.settings?.access === "public" &&
        data.settings.guestGroupId === g.id,
    })),
    ...(data.teams || []).map((t) => ({
      kind: "team" as const,
      id: t.id,
      name: t.name,
      organization: t.system === "organization",
    })),
  ].sort(
    (a, b) =>
      Number(!!("organization" in b && b.organization)) -
        Number(!!("organization" in a && a.organization)) ||
      a.name.localeCompare(b.name) ||
      a.kind.localeCompare(b.kind),
  );
}
export function audienceIncludesPerson(
  data: Workspace,
  a: AssignmentAudience,
  person: User,
) {
  if (person.id === "guest") return false;
  return a.kind === "group"
    ? effectiveGroups(person, data.groups, data.teams || []).has(a.id)
    : ancestorIds(
        reportingTeamId(person.teamId, data.teams || []) || "",
        data.teams || [],
      ).has(a.id);
}
/** Compute each person's membership once for a picker render, not once per row. */
export function audiencePeople(data: Workspace) {
  const options = audienceOptions(data);
  const people = new Map(
    options.map((a) => [contentAudienceKey(a), new Set<string>()]),
  );
  for (const person of data.users) {
    if (!person.active || person.id === "guest") continue;
    const groups = effectiveGroups(person, data.groups, data.teams || []);
    const teams = ancestorIds(
      reportingTeamId(person.teamId, data.teams || []) || "",
      data.teams || [],
    );
    for (const a of options)
      if ((a.kind === "group" ? groups : teams).has(a.id))
        people.get(contentAudienceKey(a))!.add(person.id);
  }
  return people;
}
/** Structural team coverage survives membership changes. Group coverage describes current people only. */
export function audienceCoverage(
  data: Workspace,
  candidate: AudienceOption,
  keys: string[],
  people = audiencePeople(data),
) {
  if (candidate.publicGuests) return [];
  const other = audienceOptions(data).filter(
    (a) =>
      contentAudienceKey(a) !== contentAudienceKey(candidate) &&
      keys.includes(contentAudienceKey(a)),
  );
  const organization = other.find((a) => a.organization);
  if (organization) return [organization];
  if (candidate.kind === "team")
    return other.filter(
      (a) =>
        a.kind === "team" &&
        ancestorIds(candidate.id, data.teams || []).has(a.id),
    );
  const members =
    people.get(contentAudienceKey(candidate)) || new Set<string>();
  if (
    !members.size ||
    ![...members].every((id) =>
      other.some((a) => people.get(contentAudienceKey(a))?.has(id)),
    )
  )
    return [];
  return other.filter((a) =>
    [...members].some((id) => people.get(contentAudienceKey(a))?.has(id)),
  );
}
export function audienceSummary(
  data: Workspace,
  keys: string[],
  people = audiencePeople(data),
) {
  const selected = audienceOptions(data).filter((a) =>
    keys.includes(contentAudienceKey(a)),
  );
  const count = new Set(
    selected.flatMap((a) => [...(people.get(contentAudienceKey(a)) || [])]),
  ).size;
  const everyone = selected.some((a) => a.organization);
  const guests = selected.some((a) => a.publicGuests);
  if (guests && count === 0) return "Public guests";
  return `${everyone ? "Everyone in the organization · " : ""}${count} ${count === 1 ? "person" : "people"}${guests ? " · Public guests also included" : ""}`;
}
export function updateAudienceKeys(
  content: Pick<Content, "groups" | "updateTeams">,
) {
  return [
    ...content.groups.map((id) => `group:${id}`),
    ...(content.updateTeams || []).map((id) => `team:${id}`),
  ];
}
/** Update targeting never creates a course obligation or limits reading access. */
export function updateMatchesAudience(
  content: Pick<Content, "groups" | "updateTeams">,
  user: User,
  groups: Group[],
  teams: Team[] = [],
) {
  const memberships = effectiveGroups(user, groups, teams);
  if (content.groups.some((id) => memberships.has(id))) return true;
  if (user.id === "guest") return false;
  const ancestors = ancestorIds(
    reportingTeamId(user.teamId, teams) || "",
    teams,
  );
  return (content.updateTeams || []).some((id) => ancestors.has(id));
}
