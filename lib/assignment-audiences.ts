import type { Workspace } from "./store";
import {
  ancestorIds,
  reportingTeamId,
  effectiveGroups,
  type AssignmentAudience,
  type LearningItem,
  type User,
} from "./types";
import { expandLearning, groupItems, teamItems } from "./learning-groups";

export const audienceKey = (a: AssignmentAudience) => `${a.kind}:${a.id}`;
export function assignmentAudiences(data: Workspace) {
  return [
    ...data.groups.map((g) => ({
      kind: "group" as const,
      id: g.id,
      name: g.name,
      items: groupItems(g, data.publishedContent || data.content),
    })),
    ...(data.teams || []).map((t) => ({
      kind: "team" as const,
      id: t.id,
      name: t.name,
      items: teamItems(t),
    })),
  ].sort(
    (a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind),
  );
}
export function projectAssignmentTeams(person: User, data: Workspace) {
  const teams = data.teams || [];
  const directTeam = reportingTeamId(person.teamId, teams);
  return teams
    .filter(
      (t) =>
        directTeam &&
        ancestorIds(directTeam, teams).has(t.id) &&
        ((t.learningItems?.length || 0) > 0 ||
          (t.requiredCourseIds?.length || 0) > 0),
    )
    .sort(
      (a, b) =>
        ancestorIds(a.id, teams).size - ancestorIds(b.id, teams).size ||
        a.id.localeCompare(b.id),
    )
    .map(({ id, name, learningItems, requiredCourseIds }) => ({
      id,
      name,
      learningItems,
      requiredCourseIds,
    }));
}
export function courseAudienceSources(
  data: Workspace,
  person: User,
  courseId: string,
): AssignmentAudience[] {
  const groups = effectiveGroups(
    person,
    data.groups,
    person.effectiveGroupIds ? undefined : data.teams,
  );
  const projected =
    person.assignmentTeams || projectAssignmentTeams(person, data);
  const teams = new Set(projected.map((t) => t.id));
  return assignmentAudiences({ ...data, teams: projected })
    .filter(
      (a) =>
        (a.kind === "group" ? groups.has(a.id) : teams.has(a.id)) &&
        expandLearning(a.items, data.curricula || []).includes(courseId),
    )
    .map(({ kind, id }) => ({ kind, id }));
}
export function directlyAssignedAudiences(data: Workspace, item: LearningItem) {
  return assignmentAudiences(data)
    .filter((a) =>
      a.items.some((i) => i.kind === item.kind && i.id === item.id),
    )
    .map(audienceKey);
}
export function curriculumAudienceSources(
  data: Workspace,
  key: string,
  item: LearningItem,
) {
  if (item.kind !== "course") return [];
  const audience = assignmentAudiences(data).find(
    (a) => audienceKey(a) === key,
  );
  return (audience?.items || [])
    .filter((i) => i.kind === "curriculum")
    .flatMap((i) => {
      const curriculum = data.curricula?.find(
        (c) =>
          c.id === i.id &&
          c.status === "published" &&
          c.courseIds.includes(item.id),
      );
      return curriculum ? [curriculum.name] : [];
    });
}
/** All requested audiences change in one governance save; unchanged links keep their order. */
export function assignLearningToAudiences(
  data: Workspace,
  items: LearningItem[],
  keys: string[],
  mode: "set" | "add" | "remove" = "set",
): Workspace {
  const available = assignmentAudiences(data);
  if (keys.some((key) => !available.some((a) => audienceKey(a) === key)))
    throw new Error("An audience changed. Review the current list.");
  const content = data.publishedContent || data.content;
  if (
    mode !== "remove" &&
    items.some((i) =>
      i.kind === "course"
        ? !content.some(
            (c) =>
              c.id === i.id && c.kind === "course" && c.status === "published",
          )
        : !data.curricula?.some(
            (c) => c.id === i.id && c.status === "published",
          ),
    )
  )
    throw new Error("Publish this learning before assigning it.");
  const edit = (
    kind: "group" | "team",
    id: string,
    previous: LearningItem[],
  ) => {
    const selected = keys.includes(`${kind}:${id}`);
    if (!selected && mode !== "set") return previous;
    const keep = mode === "add" || (mode === "set" && selected);
    return keep
      ? [
          ...previous,
          ...items.filter(
            (i) => !previous.some((p) => p.kind === i.kind && p.id === i.id),
          ),
        ]
      : previous.filter(
          (p) => !items.some((i) => i.kind === p.kind && i.id === p.id),
        );
  };
  return {
    ...data,
    groups: data.groups.map((g) => ({
      ...g,
      learningItems: edit("group", g.id, groupItems(g, content)),
    })),
    teams: (data.teams || []).map((t) => ({
      ...t,
      learningItems: edit("team", t.id, teamItems(t)),
    })),
  };
}

export function sourceLabels(data: Workspace, person: User, courseId: string) {
  return courseAudienceSources(data, person, courseId).map((source) => {
    const name =
      source.kind === "group"
        ? data.groups.find((g) => g.id === source.id)?.name
        : data.teams?.find((t) => t.id === source.id)?.name ||
          person.assignmentTeams?.find((t) => t.id === source.id)?.name;
    return `${source.kind === "group" ? "Group" : "Team"}: ${name || "Removed audience"}`;
  });
}

/** Compare final audience plans, including source-only changes, before an atomic save. */
export function learningChangeImpact(before: Workspace, after: Workspace) {
  const coverage = (data: Workspace) => {
    const published = new Set(
      (data.publishedContent || data.content)
        .filter((c) => c.kind === "course" && c.status === "published")
        .map((c) => c.id),
    );
    const plans = assignmentAudiences(data).map((a) => ({
      ...a,
      routes: a.items.flatMap((item) =>
        expandLearning([item], data.curricula || [])
          .filter((id) => published.has(id))
          .map((id) => ({
            id,
            route: `${audienceKey(a)}/${item.kind}:${item.id}`,
          })),
      ),
    }));
    return new Map(
      data.users.map((person) => {
        const groups = effectiveGroups(person, data.groups, data.teams || []),
          teams = reportingTeamId(person.teamId, data.teams || [])
            ? ancestorIds(
                reportingTeamId(person.teamId, data.teams || [])!,
                data.teams || [],
              )
            : new Set<string>();
        const courses = new Map<string, Set<string>>();
        for (const a of plans)
          if ((a.kind === "group" ? groups : teams).has(a.id))
            for (const { id, route } of a.routes) {
              const routes = courses.get(id) || new Set<string>();
              routes.add(route);
              courses.set(id, routes);
            }
        return [person.id, courses] as const;
      }),
    );
  };
  const previous = coverage(before),
    next = coverage(after);
  return after.users.flatMap((person) => {
    const was = previous.get(person.id) || new Map<string, Set<string>>(),
      now = next.get(person.id)!;
    const gained = [...now.keys()].filter((id) => !was.has(id)),
      lost = [...was.keys()].filter((id) => !now.has(id));
    const changed = [...now.keys()].filter(
      (id) =>
        was.has(id) &&
        [...now.get(id)!].sort().join("\n") !==
          [...was.get(id)!].sort().join("\n"),
    );
    return gained.length || lost.length || changed.length
      ? [{ person, gained, lost, changed }]
      : [];
  });
}

export function assignmentSourcePaths(
  data: Workspace,
  person: User,
  courseId: string,
) {
  const sources = courseAudienceSources(data, person, courseId);
  const audiences = assignmentAudiences({
    ...data,
    teams: person.assignmentTeams || data.teams,
  });
  return sources.flatMap((source) => {
    const audience = audiences.find(
      (a) => audienceKey(a) === audienceKey(source),
    );
    const label = `${source.kind === "team" ? "Team" : "Group"}: ${audience?.name || "Removed audience"}`;
    return (audience?.items || []).flatMap((item) => {
      if (!expandLearning([item], data.curricula || []).includes(courseId))
        return [];
      return [
        item.kind === "course"
          ? `${label} · direct`
          : `${label} · Curriculum: ${data.curricula?.find((c) => c.id === item.id)?.name || "Unavailable curriculum"}`,
      ];
    });
  });
}
