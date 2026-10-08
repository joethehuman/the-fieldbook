import type { Workspace } from "./store";
import {
  audienceOptions,
  audiencePeople,
  contentAudienceKey,
  type AudienceOption,
} from "./content-audiences";
import { groupTeamLinks } from "./types";

/** Coverage here means a durable relationship, never coincidental member overlap. */
export function audienceTransfer(
  data: Workspace,
  selected: string[],
  inherited: Record<string, string[]> = {},
  showPeople = true,
) {
  const options = audienceOptions(data).filter(
    (option) => showPeople || option.kind === "group",
  );
  const people = audiencePeople(data);
  const keys = new Set([...selected, ...Object.keys(inherited)]);
  const organizationSelected = options.some(
    (option) => option.organization && keys.has(contentAudienceKey(option)),
  );
  const teamById = new Map((data.teams || []).map((team) => [team.id, team]));
  const ancestors = new Map(
    (data.teams || []).map((team) => {
      const chain = new Set<string>();
      let current: string | undefined = team.id;
      while (current && !chain.has(current)) {
        chain.add(current);
        current = teamById.get(current)?.parentId;
      }
      return [team.id, chain];
    }),
  );
  const groupLinks = new Map(
    data.groups.map((group) => [group.id, groupTeamLinks(group)]),
  );
  const teams = options.filter(
    (option) => option.kind === "team" && !option.organization,
  );
  const covers = (source: AudienceOption, team: AudienceOption) => {
    if (contentAudienceKey(source) === contentAudienceKey(team)) return false;
    if (source.organization) return true;
    const chain = ancestors.get(team.id);
    return source.kind === "team"
      ? !!chain?.has(source.id)
      : (groupLinks.get(source.id) || []).some(
          (link) => link.scope === "subtree" && chain?.has(link.teamId),
        );
  };
  // Cache source expansions once, including legacy direct-only links for explanation.
  const includedBySource = new Map(
    options.map((source) => [
      contentAudienceKey(source),
      teams.flatMap((team) => {
        const structural = covers(source, team);
        const directOnly =
          source.kind === "group" &&
          (groupLinks.get(source.id) || []).some(
            (link) => link.scope === "direct" && link.teamId === team.id,
          );
        return structural || directOnly
          ? [{ ...team, directMembersOnly: !structural }]
          : [];
      }),
    ]),
  );
  const sources = options.filter((option) =>
    keys.has(contentAudienceKey(option)),
  );
  const coveredBy = new Map(
    options.map((option) => [
      contentAudienceKey(option),
      showPeople && option.kind === "team"
        ? sources.filter((source) => covers(source, option))
        : [],
    ]),
  );
  const available = options.filter((option) => {
    const key = contentAudienceKey(option);
    return (
      !keys.has(key) &&
      !coveredBy.get(key)?.length &&
      (!organizationSelected || option.publicGuests)
    );
  });
  const includedTeams = (source: AudienceOption) =>
    includedBySource.get(contentAudienceKey(source)) || [];
  return { options, people, available, coveredBy, includedTeams };
}
