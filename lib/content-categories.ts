import type { Content } from "./types";
import type { SiteSettings } from "./settings";

export type CategoryKind = "course" | "brief";
/** Course array order is reader order; Updates have no authored order. */
export type ContentCategories = Record<CategoryKind, string[]>;
export type CategoryPlacement = Pick<Content, "id" | "kind" | "category">;
export const categoryKey = (name: string) => name.trim().toLocaleLowerCase();

export function categoryName(name: string, names: string[], previous?: string) {
  const clean = name.trim();
  if (!clean || clean.length > 80)
    throw new Error("Enter a category name of 1–80 characters.");
  if (
    names.some(
      (item) => item !== previous && categoryKey(item) === categoryKey(clean),
    )
  )
    throw new Error(
      "A category with that name already exists for this content type.",
    );
  return clean;
}

export function validateContentCategories(categories: ContentCategories) {
  for (const kind of ["course", "brief"] as const) {
    if (categories[kind].length > 500)
      throw new Error("Use no more than 500 categories per content type.");
    const seen: string[] = [];
    for (const name of categories[kind]) seen.push(categoryName(name, seen));
  }
}

export function availableCategories(
  content: CategoryPlacement[],
  kind: CategoryKind,
  settings?: Pick<SiteSettings, "contentCategories">,
): string[] {
  const saved = settings?.contentCategories?.[kind];
  const names =
    saved ??
    content.filter((item) => item.kind === kind).map((item) => item.category);
  const unique = [
    ...new Map(
      names.filter(Boolean).map((name) => [categoryKey(name), name.trim()]),
    ).values(),
  ];
  return kind === "brief" ? unique.sort((a, b) => a.localeCompare(b)) : unique;
}

export function categoryLists(
  content: CategoryPlacement[],
  settings?: Pick<SiteSettings, "contentCategories">,
): ContentCategories {
  return {
    course: availableCategories(content, "course", settings),
    brief: availableCategories(content, "brief", settings),
  };
}

export function orderedCourseCategories(
  content: CategoryPlacement[],
  settings?: Pick<SiteSettings, "contentCategories">,
) {
  const present = [
    ...new Set(
      content
        .filter((item) => item.kind === "course")
        .map((item) => item.category),
    ),
  ];
  const configured = settings?.contentCategories?.course;
  if (!configured) return present;
  const rank = (name: string) => {
    const index = configured.findIndex(
      (item) => categoryKey(item) === categoryKey(name),
    );
    return index < 0 ? configured.length : index;
  };
  return present.sort((a, b) => rank(a) - rank(b));
}

/** Retired/restored labels remain visible for repair, without recreating a category. */
export function categoryItems(
  content: Content[],
  published: Content[],
  kind: CategoryKind,
  name?: string,
  lists?: ContentCategories,
) {
  const matches = (item: Content) =>
    item.kind === kind &&
    (name !== undefined
      ? categoryKey(item.category) === categoryKey(name)
      : !lists?.[kind].some(
          (category) => categoryKey(category) === categoryKey(item.category),
        ));
  const ids = new Set(
    [...content, ...published].filter(matches).map((item) => item.id),
  );
  return content.filter((item) => ids.has(item.id));
}

/** Validate actual draft and published placements before removing a saved name. */
export function assertCategoriesCanBeRemoved(
  previous: Pick<SiteSettings, "contentCategories">,
  next: ContentCategories,
  placements: CategoryPlacement[],
) {
  const before = categoryLists(placements, previous);
  for (const kind of ["course", "brief"] as const) {
    const removed = before[kind].filter(
      (name) =>
        !next[kind].some((item) => categoryKey(item) === categoryKey(name)),
    );
    if (
      placements.some(
        (item) =>
          item.kind === kind &&
          removed.some(
            (name) => categoryKey(item.category) === categoryKey(name),
          ),
      )
    )
      throw new Error(
        "Move this category’s items elsewhere before deleting it. A draft or published copy still uses it.",
      );
  }
}

export function assertContentCategory(
  content: Pick<Content, "kind" | "category">,
  settings: Pick<SiteSettings, "contentCategories">,
) {
  if (
    content.kind === "doc" ||
    !content.category.trim() ||
    !settings.contentCategories
  )
    return;
  const name = settings.contentCategories[content.kind].find(
    (item) => categoryKey(item) === categoryKey(content.category),
  );
  if (!name)
    throw new Error(
      "That category is no longer available. Choose an existing category or ask an administrator to create one.",
    );
  content.category = name;
}
