import type { LearningView } from "./course-destination";
import { compareOptionalDates, sortLabels } from "./collection-sort";
export type LearningSort =
  | "title"
  | "title-desc"
  | "updated"
  | "oldest"
  | "assigned-newest"
  | "assigned-oldest"
  | "due-earliest"
  | "due-latest";
export function learningSortOptions(
  view: LearningView,
  guest: boolean,
  deadlines: boolean,
) {
  const options: { value: LearningSort; label: string }[] = [
    { value: "title", label: sortLabels.titleAsc },
    { value: "title-desc", label: sortLabels.titleDesc },
  ];
  if (view === "home" || view === "all")
    options.push(
      { value: "updated", label: sortLabels.updatedNewest },
      { value: "oldest", label: sortLabels.updatedOldest },
    );
  if (!guest && (view === "yours" || (view === "assigned" && deadlines)))
    options.push(
      { value: "assigned-newest", label: sortLabels.assignedNewest },
      { value: "assigned-oldest", label: sortLabels.assignedOldest },
    );
  if (
    !guest &&
    deadlines &&
    (view === "yours" || view === "assigned" || view === "in-progress")
  )
    options.push(
      { value: "due-earliest", label: sortLabels.dueEarliest },
      { value: "due-latest", label: sortLabels.dueLatest },
    );
  return options;
}
export type LearningSortRecord = {
  id: string;
  title: string;
  updatedAt?: string;
  assignedAt?: string;
  dueDate?: string;
};
export function compareLearningRecords(
  a: LearningSortRecord,
  b: LearningSortRecord,
  sort: string,
) {
  const title = a.title.localeCompare(b.title);
  const dates = sort.startsWith("assigned-")
    ? compareOptionalDates(
        a.assignedAt,
        b.assignedAt,
        sort === "assigned-newest",
      )
    : sort.startsWith("due-")
      ? compareOptionalDates(a.dueDate, b.dueDate, sort === "due-latest")
      : sort === "updated" || sort === "oldest"
        ? compareOptionalDates(a.updatedAt, b.updatedAt, sort === "updated")
        : 0;
  return (
    dates ||
    (sort === "title-desc" ? -title : title) ||
    a.id.localeCompare(b.id)
  );
}
