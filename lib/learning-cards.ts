import {
  effectiveGroups,
  isComplete,
  type Content,
  type Curriculum,
  type Group,
  type Progress,
  type User,
} from "./types";
import { courseProgress } from "./course-progress";
import { completionPercent } from "./learning";
import { groupItems } from "./learning-groups";

export type LearningCardItem =
  | { kind: "course"; course: Content }
  | { kind: "curriculum"; curriculum: Curriculum; courses: Content[] };
export function curriculumCourses(curriculum: Curriculum, courses: Content[]) {
  return [...new Set(curriculum.courseIds)].flatMap(
    (id) =>
      courses.find(
        (c) => c.id === id && c.kind === "course" && c.status === "published",
      ) || [],
  );
}
export function curriculumProgress(courses: Content[], progress: Progress[]) {
  const completed = courses.filter((c) => isComplete(c, progress)).length;
  return {
    completed,
    complete: courses.length > 0 && completed === courses.length,
    started: courses.some((c) => courseProgress(c, progress).started),
    percent: completionPercent(completed, courses.length),
  };
}
/** Presentation only: assignment and overall progress remain distinct course counts. */
export function assignedLearningCards(
  sequence: Content[],
  curricula: Curriculum[],
  user: User,
  groups: Group[],
): LearningCardItem[] {
  const memberships = effectiveGroups(user, groups);
  const linked = new Set(
    [
      ...groups
        .filter((g) => memberships.has(g.id))
        .flatMap((g) => groupItems(g, sequence)),
      ...(user.assignmentTeams || []).flatMap((t) => t.learningItems || []),
    ]
      .filter((i) => i.kind === "curriculum")
      .map((i) => i.id),
  );
  const playlists = curricula
    .filter((c) => c.status === "published" && linked.has(c.id))
    .map((curriculum) => ({
      kind: "curriculum" as const,
      curriculum,
      courses: curriculumCourses(curriculum, sequence),
    }))
    .filter((c) => c.courses.length);
  const represented = new Set(
    playlists.flatMap((c) => c.courses.map((course) => course.id)),
  );
  const cards: LearningCardItem[] = [
    ...playlists,
    ...sequence
      .filter((c) => !represented.has(c.id))
      .map((course) => ({ kind: "course" as const, course })),
  ];
  const ranks = new Map(sequence.map((c, i) => [c.id, i]));
  const rank = (item: LearningCardItem) =>
    Math.min(
      ...(item.kind === "course" ? [item.course] : item.courses).map(
        (c) => ranks.get(c.id) ?? Infinity,
      ),
    );
  return cards.sort((a, b) => rank(a) - rank(b));
}
