import { isComplete, type Content, type Progress } from "./types";
import { completionPercent } from "./learning";

/** Current-version activity only; merely opening a course is not activity. */
export function courseProgress(course: Content, records: Progress[]) {
  const record = records.find(
    (p) => p.content_id === course.id && p.version === course.version,
  );
  const lessons = course.lessons.filter((l) =>
    record?.lessons.includes(l.id),
  ).length;
  const complete = isComplete(course, records);
  const started = lessons > 0 || !!record?.passed || !!record?.attempts?.length;
  return {
    complete,
    started,
    inProgress: started && !complete,
    // The knowledge check is one step, so lessons alone never imply completion.
    percent: completionPercent(
      lessons + (record?.passed ? 1 : 0),
      course.lessons.length + 1,
    ),
  };
}

export type LearningCollection =
  "yours" | "assigned" | "in-progress" | "completed" | "all";

export function learningCollection(
  courses: Content[],
  assigned: Content[],
  progress: Progress[],
  collection: LearningCollection,
  hideCompleted = false,
) {
  const assignedIds = new Set(assigned.map((c) => c.id));
  return courses.filter((course) => {
    if (course.kind !== "course" || course.status !== "published") return false;
    const status = courseProgress(course, progress);
    if (collection === "assigned")
      return assignedIds.has(course.id) && (!hideCompleted || !status.complete);
    if (collection === "yours")
      return assignedIds.has(course.id) || status.started || status.complete;
    if (collection === "in-progress") return status.inProgress;
    if (collection === "completed") return status.complete;
    return true;
  });
}
