import type { Workspace } from "./store";
import type { LearningItem } from "./types";
import { assignmentInfo } from "./types";
import {
  courseAudienceSources,
  projectAssignmentTeams,
} from "./assignment-audiences";
import { expandLearning } from "./learning-groups";
import { assignmentDeadline } from "./assignment-episodes";

/** Present the actual deduplicated consequences; saving still uses governance validation. */
export function learningAudienceReview(
  before: Workspace,
  after: Workspace,
  item: LearningItem | LearningItem[],
  stamp: string,
) {
  const items = Array.isArray(item) ? item : [item];
  const ids = new Set(expandLearning(items, after.curricula || []));
  const courses = (after.publishedContent || after.content).filter(
    (c) => c.kind === "course" && c.status === "published" && ids.has(c.id),
  );
  const dueDates = after.settings?.dueDatesEnabled !== false;
  const rows = after.users
    .filter((p) => p.active && p.id !== "guest")
    .flatMap((person) => {
      const previous = before.users.find((p) => p.id === person.id);
      return courses.flatMap((course) => {
        const was =
          !!previous &&
          courseAudienceSources(
            before,
            {
              ...previous,
              effectiveGroupIds: undefined,
              assignmentTeams: projectAssignmentTeams(previous, before),
            },
            course.id,
          ).length > 0;
        const now =
          courseAudienceSources(
            after,
            {
              ...person,
              effectiveGroupIds: undefined,
              assignmentTeams: projectAssignmentTeams(person, after),
            },
            course.id,
          ).length > 0;
        if (!was && !now) return [];
        const status = now
          ? was
            ? "Already assigned"
            : "New assignment"
          : "Removed";
        const saved = previous?.learningAssignments?.find(
          (a) => a.contentId === course.id && a.version === course.version,
        );
        const due =
          !now || !dueDates
            ? undefined
            : was
              ? saved?.dueDate ||
                (previous &&
                  assignmentInfo(course, previous, before.groups).dueDate)
              : assignmentDeadline(
                  stamp,
                  {
                    ...person,
                    onboardingDays:
                      person.onboardingDays ??
                      after.settings?.onboardingDays ??
                      90,
                  },
                  after.settings?.catchUpDays ?? 30,
                ).slice(0, 10);
        return [
          {
            personId: person.id,
            person: person.name,
            courseId: course.id,
            course: course.title,
            status,
            due,
            saved: was && now,
          },
        ];
      });
    });
  const count = (predicate: (row: (typeof rows)[number]) => boolean) =>
    new Set(rows.filter(predicate).map((r) => r.personId)).size;
  return {
    rows,
    dueDates,
    gained: count((r) => r.status === "New assignment"),
    lost: count((r) => r.status === "Removed"),
    retained: count((r) => r.saved),
    total: count((r) => r.status !== "Removed"),
  };
}
