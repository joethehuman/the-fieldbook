import type { Workspace } from "./store";
import type { Content, EffectiveAssignment, User } from "./types";
import {
  assignedCourses,
  assignmentInfo,
  effectiveGroups,
  isComplete,
  reportTeamIds,
  reportingTeamId,
  type Team,
} from "./types";
import { addDays, assignmentRules, onboardingClockTarget } from "./learning";
import {
  courseAudienceSources,
  projectAssignmentTeams,
  learningChangeImpact,
} from "./assignment-audiences";
export function assignmentDeadline(start: string, person: User, days: number) {
  const catchUp = addDays(start, days),
    onboarding = onboardingClockTarget(person);
  return onboarding && onboarding > catchUp ? onboarding : catchUp;
}

export function reconcileAssignments(
  before: Workspace,
  after: Workspace,
  stamp: string,
  baseline = false,
) {
  return after.users.map((person) => {
    const projected = {
      ...person,
      effectiveGroupIds: [
        ...effectiveGroups(person, after.groups, after.teams || []),
      ],
      assignmentTeams: projectAssignmentTeams(person, after),
    };
    const old = before.users.find((p) => p.id === person.id);
    const learningAssignments = assignedCourses(
      after.publishedContent || after.content,
      projected,
      after.groups,
    ).map((course) => {
      const sourceAudiences = courseAudienceSources(
        after,
        projected,
        course.id,
      );
      const sourceGroups = sourceAudiences
        .filter((a) => a.kind === "group")
        .map((a) => a.id);
      const previous = old?.learningAssignments?.find(
        (a) => a.contentId === course.id && a.version === course.version,
      );
      if (previous) return { ...previous, sourceGroups, sourceAudiences };
      const assignedAt = baseline
        ? assignmentInfo(course, projected, after.groups).assignedAt || stamp
        : stamp;
      const catchUpDays = after.settings?.catchUpDays ?? 30;
      const catchUp = addDays(assignedAt, catchUpDays),
        onboardingEnd = onboardingClockTarget(projected, after.settings);
      return {
        episodeId: crypto.randomUUID(),
        contentId: course.id,
        version: course.version,
        assignedAt,
        dueDate:
          onboardingEnd && onboardingEnd > catchUp ? onboardingEnd : catchUp,
        catchUpDays,
        ...(onboardingEnd ? { onboardingEnd } : {}),
        sourceGroups,
        sourceAudiences,
        baseline,
      } satisfies EffectiveAssignment;
    });
    return {
      ...projected,
      effectiveGroupIds: [
        ...effectiveGroups(
          { ...person, groups: [] },
          after.groups,
          after.teams || [],
        ),
      ],
      learningAssignments,
    };
  });
}

export type DeadlineReview = {
  token: string;
  clocks: { personId: string; name: string; before: string; after: string }[];
  courses: {
    personId: string;
    name: string;
    contentId: string;
    title: string;
    before: string;
    after: string;
  }[];
  onboardingDays: number;
  catchUpDays: number;
};
function fingerprint(data: Workspace) {
  const text = JSON.stringify([
    data.governanceRevision,
    data.revision,
    data.settings,
    data.users,
    data.progress,
  ]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export function reviewDeadlines(data: Workspace): DeadlineReview {
  const onboardingDays = data.settings?.onboardingDays ?? 90,
    catchUpDays = data.settings?.catchUpDays ?? 30;
  const clocks: DeadlineReview["clocks"] = [],
    courses: DeadlineReview["courses"] = [];
  for (const person of data.users) {
    if (!person.active) continue;
    const next = { ...person, onboardingDays };
    const before = onboardingClockTarget(person),
      after = onboardingClockTarget(next);
    if (before && after && before !== after)
      clocks.push({ personId: person.id, name: person.name, before, after });
    for (const assignment of person.learningAssignments || []) {
      const course = (data.publishedContent || data.content).find(
        (c) =>
          c.id === assignment.contentId && c.version === assignment.version,
      );
      if (!course || isComplete(course, data.progress[person.id] || []))
        continue;
      const target = assignmentDeadline(
        assignment.assignedAt,
        next,
        catchUpDays,
      );
      if (target !== assignment.dueDate)
        courses.push({
          personId: person.id,
          name: person.name,
          contentId: course.id,
          title: course.title,
          before: assignment.dueDate,
          after: target,
        });
    }
  }
  return {
    token: fingerprint(data),
    clocks,
    courses,
    onboardingDays,
    catchUpDays,
  };
}
export function recalculateDeadlines(data: Workspace, token: string) {
  const review = reviewDeadlines(data);
  if (review.token !== token)
    throw new Error(
      "People, assignments or settings changed. Review deadlines again.",
    );
  const next = structuredClone(data);
  next.users = next.users.map((person) => {
    if (!person.active) return person;
    const updated = {
      ...person,
      onboardingDays:
        person.hireDate || person.onboardingStart
          ? review.onboardingDays
          : undefined,
    };
    updated.learningAssignments = person.learningAssignments?.map((a) => {
      const course = (data.publishedContent || data.content).find(
        (c) => c.id === a.contentId && c.version === a.version,
      );
      return course && !isComplete(course, data.progress[person.id] || [])
        ? {
            ...a,
            dueDate: assignmentDeadline(
              a.assignedAt,
              updated,
              review.catchUpDays,
            ),
            catchUpDays: review.catchUpDays,
            onboardingEnd: onboardingClockTarget(updated),
          }
        : a;
    });
    return updated;
  });
  next.governanceRevision = (next.governanceRevision || 1) + 1;
  return next;
}

export type AssignmentImpact = {
  person: User;
  gained: Content[];
  lost: Content[];
};
export function assignmentImpact(before: Workspace, after: Workspace) {
  const content = after.publishedContent || after.content;
  return learningChangeImpact(before, after)
    .map(({ person, gained, lost }) => ({
      person,
      gained: gained.flatMap((id) =>
        content.filter(
          (c) => c.id === id && c.kind === "course" && c.status === "published",
        ),
      ),
      lost: lost.flatMap((id) =>
        (before.publishedContent || before.content).filter(
          (c) => c.id === id && c.kind === "course" && c.status === "published",
        ),
      ),
    }))
    .filter((row) => row.gained.length || row.lost.length);
}
/** Exact people exposed or removed from each manager's authorized reporting scope. */
export function reportingImpact(before: Workspace, after: Workspace) {
  const managers = [
    ...new Map(
      [...before.users, ...after.users]
        .filter((p) => p.role === "manager" || p.role === "contributor")
        .map((p) => [p.id, p]),
    ).values(),
  ];
  return managers.flatMap((manager) => {
    const was = reportTeamIds(
      before.users.find((p) => p.id === manager.id) || {
        ...manager,
        active: false,
      },
      before.teams || [],
    );
    const now = reportTeamIds(
      after.users.find((p) => p.id === manager.id) || {
        ...manager,
        active: false,
      },
      after.teams || [],
    );
    const inScope = (p: User, ids: Set<string>, teams: Team[]) =>
      p.active && ids.has(reportingTeamId(p.teamId, teams) || "");
    return [
      ...after.users
        .filter(
          (p) =>
            inScope(p, now, after.teams || []) &&
            !before.users.some(
              (old) => old.id === p.id && inScope(old, was, before.teams || []),
            ),
        )
        .map((person) => ({
          manager,
          person,
          change: "Reporting access added",
        })),
      ...before.users
        .filter(
          (p) =>
            inScope(p, was, before.teams || []) &&
            !after.users.some(
              (next) =>
                next.id === p.id && inScope(next, now, after.teams || []),
            ),
        )
        .map((person) => ({
          manager,
          person,
          change: "Reporting access removed",
        })),
    ];
  });
}
