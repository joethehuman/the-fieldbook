/** Shared visible vocabulary; each collection decides which fields are useful. */
export const sortLabels = {
  nameAsc: "Name (A–Z)",
  nameDesc: "Name (Z–A)",
  titleAsc: "Title (A–Z)",
  titleDesc: "Title (Z–A)",
  createdNewest: "Created (newest)",
  createdOldest: "Created (oldest)",
  updatedNewest: "Updated (newest)",
  updatedOldest: "Updated (oldest)",
  assignedNewest: "Assigned (newest)",
  assignedOldest: "Assigned (oldest)",
  addedNewest: "Added (newest)",
  addedOldest: "Added (oldest)",
  dueEarliest: "Due (earliest)",
  dueLatest: "Due (latest)",
  peopleMost: "People (most)",
  peopleFewest: "People (fewest)",
  coursesMost: "Courses (most)",
  coursesFewest: "Courses (fewest)",
  completionLowest: "Completion (lowest)",
  completionHighest: "Completion (highest)",
  pastDueMost: "Past due (most)",
  pastDueFewest: "Past due (fewest)",
  deletedNewest: "Deleted (newest)",
  deletedOldest: "Deleted (oldest)",
} as const;

/** Unknown values stay last in either direction, rather than reversing their placement. */
export function compareOptionalNumbers(
  a: number | null | undefined,
  b: number | null | undefined,
  descending = false,
) {
  const first = a != null && Number.isFinite(a) ? a : null;
  const second = b != null && Number.isFinite(b) ? b : null;
  if (first === null || second === null)
    return Number(first === null) - Number(second === null);
  return (descending ? -1 : 1) * (first - second);
}
export function compareOptionalDates(
  a: string | undefined,
  b: string | undefined,
  newest = true,
) {
  return compareOptionalNumbers(
    a ? Date.parse(a) : null,
    b ? Date.parse(b) : null,
    newest,
  );
}
