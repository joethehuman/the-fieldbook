import type { Workspace } from "./store";
import type { LearningItem } from "./types";
import { groupItems } from "./learning-groups";

export function directlyAssignedGroups(
  data: Workspace,
  item: LearningItem,
): string[] {
  return data.groups
    .filter((g) =>
      groupItems(g, data.publishedContent || data.content).some(
        (i) => i.kind === item.kind && i.id === item.id,
      ),
    )
    .map((g) => g.id);
}
export function curriculumSources(
  data: Workspace,
  groupId: string,
  item: LearningItem,
): string[] {
  if (item.kind !== "course") return [];
  const group = data.groups.find((g) => g.id === groupId);
  if (!group) return [];
  return groupItems(group, data.publishedContent || data.content)
    .filter((i) => i.kind === "curriculum")
    .flatMap((i) => {
      const c = data.curricula?.find(
        (c) =>
          c.id === i.id &&
          c.status === "published" &&
          c.courseIds.includes(item.id),
      );
      return c ? [c.name] : [];
    });
}
/** Edit the same ordered group-learning links as the group workspace. Unchanged links never move. */
export function assignLearningToGroups(
  data: Workspace,
  item: LearningItem,
  selected: string[],
): Workspace {
  const eligible =
    item.kind === "course"
      ? (data.publishedContent || data.content).some(
          (c) =>
            c.id === item.id && c.kind === "course" && c.status === "published",
        )
      : data.curricula?.some(
          (c) => c.id === item.id && c.status === "published",
        );
  if (!eligible) throw new Error("Publish this learning before assigning it.");
  if (selected.some((id) => !data.groups.some((g) => g.id === id)))
    throw new Error("A learning group changed. Review the current groups.");
  return {
    ...data,
    groups: data.groups.map((g) => {
      const items = groupItems(g, data.publishedContent || data.content);
      const exists = items.some(
        (i) => i.kind === item.kind && i.id === item.id,
      );
      const wanted = selected.includes(g.id);
      return exists === wanted
        ? g
        : {
            ...g,
            learningItems: wanted
              ? [...items, item]
              : items.filter((i) => i.kind !== item.kind || i.id !== item.id),
          };
    }),
  };
}
