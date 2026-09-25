export type GroupBrowseSort =
  | "assigned-first"
  | "updated-newest"
  | "updated-oldest"
  | "created-newest"
  | "created-oldest"
  | "title";

type BrowseItem = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  assigned?: boolean;
};

function date(value?: string) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** Sorts the picker only; the group's saved recommendation order is untouched. */
export function sortGroupBrowseItems<T extends BrowseItem>(
  items: T[],
  sort: GroupBrowseSort,
): T[] {
  return [...items].sort((a, b) => {
    if (sort === "assigned-first" && !!a.assigned !== !!b.assigned)
      return a.assigned ? -1 : 1;
    if (sort !== "title") {
      const field = sort.startsWith("created") ? "createdAt" : "updatedAt";
      const first = date(a[field]);
      const second = date(b[field]);
      if (first !== null && second !== null && first !== second)
        return sort.endsWith("oldest") ? first - second : second - first;
      if (first !== null && second === null) return -1;
      if (first === null && second !== null) return 1;
    }
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}
