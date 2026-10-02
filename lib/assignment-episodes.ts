import type { Workspace } from "./store";
import type { Content, EffectiveAssignment, User } from "./types";
import {
  assignedCourses,
  effectiveGroups,
  isComplete,
  reportTeamIds,
} from "./types";
import { addDays, assignmentRules, onboardingClockTarget } from "./learning";

export function assignmentDeadline(start: string, person: User, days: number) {
  const catchUp = addDays(start, days),
    onboarding = onboardingClockTarget(person);
  return onboarding && onboarding > catchUp ? onboarding : catchUp;
}

/** Reconcile coverage as one course/version obligation, rather than one per source. */
export function reconcileAssignments(
  before: Workspace,
  after: Workspace,
  stamp: string,
  baseline = false,
) {
  const courses = after.publishedContent || after.content;
  return after.users.map((person) => {
    const old = before.users.find((p) => p.id === person.id);
    const memberships = effectiveGroups(
      person,
      after.groups,
      after.teams || [],
    );
    const learningAssignments = assignedCourses(
      courses,
      {
        ...person,
        effectiveGroupIds: [...memberships],
        effectiveGroupJoinedAt: Object.fromEntries(
          [...memberships].map((id) => [
            id,
            person.effectiveGroupJoinedAt?.[id] || stamp,
          ]),
        ),
      },
      after.groups,
    ).map((course) => {
      const sources = assignmentRules(course)
        .filter((a) => a.groupId && memberships.has(a.groupId))
        .map((a) => a.groupId!);
      const previous = old?.learningAssignments?.find(
        (a) => a.contentId === course.id && a.version === course.version,
      );
      if (previous) return { ...previous, sourceGroups: sources };
      const days = after.settings?.catchUpDays ?? 30;
      // Backfill preserves the current derived baseline. New coverage starts when
      // the change takes effect, even when the account has never signed in.
      const assignedAt = baseline
        ? assignmentRules(course)
            .filter((a) => a.groupId && memberships.has(a.groupId))
            .map((a) => {
              const joined =
                person.effectiveGroupJoinedAt?.[a.groupId!] ||
                person.groupJoinedAt?.[a.groupId!] ||
                a.assignedAt;
              return joined > a.assignedAt ? joined : a.assignedAt;
            })
            .sort()[0] || stamp
        : stamp;
      return {
        episodeId: crypto.randomUUID(),
        contentId: course.id,
        version: course.version,
        assignedAt,
        dueDate: assignmentDeadline(assignedAt, person, days),
        catchUpDays: days,
        onboardingEnd: onboardingClockTarget(person),
        sourceGroups: sources,
        baseline,
      } satisfies EffectiveAssignment;
    });
    return {
      ...person,
      // Readers consume a compact projection without the organization tree.
      // Recompute team coverage here so a move or unlink cannot leave stale IDs.
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
export function assignmentImpact(
  before: Workspace,
  after: Workspace,
): AssignmentImpact[] {
  const courses = after.publishedContent || after.content;
  return after.users
    .map((person) => {
      const old = before.users.find((p) => p.id === person.id);
      const assigned = (p: User, data: Workspace) => {
        const groups = effectiveGroups(p, data.groups, data.teams || []);
        return courses.filter(
          (c) =>
            c.kind === "course" &&
            c.status === "published" &&
            data.groups.some((g) => {
              if (!groups.has(g.id)) return false;
              const items = g.learningItems;
              return items
                ? items.some((i) =>
                    i.kind === "course"
                      ? i.id === c.id
                      : data.curricula?.some(
                          (playlist) =>
                            playlist.id === i.id &&
                            playlist.status === "published" &&
                            playlist.courseIds.includes(c.id),
                        ),
                  )
                : g.requiredCourseIds?.includes(c.id) ||
                    assignmentRules(c).some((a) => a.groupId === g.id);
            }),
        );
      };
      const was = old ? assigned(old, before) : [],
        now = assigned(person, after);
      return {
        person,
        gained: now.filter((c) => !was.some((p) => p.id === c.id)),
        lost: was.filter((c) => !now.some((p) => p.id === c.id)),
      };
    })
    .filter((row) => row.gained.length || row.lost.length);
}
/** Exact people exposed or removed from each manager's authorized reporting scope. */
export function reportingImpact(before: Workspace, after: Workspace) {
  const managers = [
    ...new Map(
      [...before.users, ...after.users]
        .filter((p) => p.role === "manager")
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
    const inScope = (p: User, ids: Set<string>) =>
      p.active && !!p.teamId && ids.has(p.teamId);
    return [
      ...after.users
        .filter(
          (p) =>
            inScope(p, now) &&
            !before.users.some((old) => old.id === p.id && inScope(old, was)),
        )
        .map((person) => ({
          manager,
          person,
          change: "Reporting access added",
        })),
      ...before.users
        .filter(
          (p) =>
            inScope(p, was) &&
            !after.users.some((next) => next.id === p.id && inScope(next, now)),
        )
        .map((person) => ({
          manager,
          person,
          change: "Reporting access removed",
        })),
    ];
  });
}
