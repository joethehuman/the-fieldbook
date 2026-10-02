import type { Workspace } from "./store";
import type { EffectiveAssignment } from "./types";
import { effectiveGroups, assignedCourses, assignmentInfo } from "./types";
import { addDays, onboardingClockTarget } from "./learning";
import {
  courseAudienceSources,
  projectAssignmentTeams,
} from "./assignment-audiences";

/** One active obligation per person/course/version. Changing its sources preserves its clock. */
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
    return { ...projected, learningAssignments };
  });
}
