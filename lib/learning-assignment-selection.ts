import type { Workspace } from "./store";
import type { LearningItem } from "./types";
import {
  assignmentAudiences,
  assignLearningToAudiences,
} from "./assignment-audiences";
import { sourcePassages } from "./search";

export type LearningAssignmentTarget =
  | { kind: "items"; items: LearningItem[]; mode: "add" | "remove" }
  | {
      kind: "audiences";
      keys: string[];
      mode: "add" | "remove";
      selected?: string[];
    };

export const learningItemKey = (item: LearningItem) =>
  `${item.kind}:${item.id}`;
export function selectedLearningItems(
  target: LearningAssignmentTarget,
  values: string[],
): LearningItem[] {
  return target.kind === "items"
    ? target.items
    : values.map((key) => ({
        kind: key.startsWith("curriculum:") ? "curriculum" : "course",
        id: key.slice(key.indexOf(":") + 1),
      }));
}
/** Add/remove only the requested links; never replace a batch's unrelated audiences. */
export function applyLearningSelection(
  data: Workspace,
  target: LearningAssignmentTarget,
  values: string[],
) {
  const items = selectedLearningItems(target, values);
  const keys = target.kind === "audiences" ? target.keys : values;
  const available = learningSelectionOptions(data, target);
  if (
    !items.length ||
    !keys.length ||
    values.some((value) => !available.some((option) => option.id === value))
  )
    throw new Error(
      "Learning or audiences changed. Refresh to review the current selection.",
    );
  return assignLearningToAudiences(data, items, keys, target.mode);
}

type LearningSelectionOption = {
  id: string;
  label: string;
  type?: "course" | "curriculum";
  description?: string;
  category?: string;
  updatedAt?: string;
  searchText?: string;
};
export function learningSelectionOptions(
  data: Workspace,
  target: LearningAssignmentTarget,
): LearningSelectionOption[] {
  const audiences = assignmentAudiences(data);
  if (target.kind === "items")
    return audiences
      .filter(
        (audience) =>
          target.mode === "add" ||
          target.items.some((item) =>
            audience.items.some(
              (saved) => learningItemKey(saved) === learningItemKey(item),
            ),
          ),
      )
      .map((audience) => ({
        id: `${audience.kind}:${audience.id}`,
        label: `${audience.kind === "team" ? "Team" : "Group"}: ${audience.name}`,
      }));
  const plans = audiences.filter((audience) =>
    target.keys.includes(`${audience.kind}:${audience.id}`),
  );
  const direct = new Set(
    plans.flatMap((audience) => audience.items.map(learningItemKey)),
  );
  const content = (data.publishedContent || data.content).filter(
    (item) =>
      item.status === "published" ||
      (target.mode === "remove" && direct.has(`course:${item.id}`)),
  );
  const searchable = new Map(
    content.map((item) => [
      item.id,
      sourcePassages(item)
        .map((passage) =>
          [passage.title, passage.lessonTitle, passage.text]
            .filter(Boolean)
            .join(" "),
        )
        .join(" "),
    ]),
  );
  const options: LearningSelectionOption[] = [
    ...content
      .filter((item) => item.kind === "course")
      .map((item) => ({
        id: `course:${item.id}`,
        label: item.title,
        type: "course" as const,
        description: item.summary,
        category: item.category,
        updatedAt: item.updatedAt,
        searchText: searchable.get(item.id),
      })),
    ...(data.curricula || [])
      .filter(
        (item) =>
          item.status === "published" ||
          (target.mode === "remove" && direct.has(`curriculum:${item.id}`)),
      )
      .map((item) => ({
        id: `curriculum:${item.id}`,
        label: item.name,
        type: "curriculum" as const,
        description: item.description,
        searchText: item.courseIds
          .map((id) => searchable.get(id) || "")
          .join(" "),
      })),
  ];
  const known = new Set(options.map((option) => option.id));
  if (target.mode === "remove")
    for (const item of plans.flatMap((audience) => audience.items)) {
      const id = learningItemKey(item);
      if (!known.has(id)) {
        options.push({
          id,
          label:
            item.kind === "course"
              ? "Unavailable course"
              : "Unavailable curriculum",
          type: item.kind,
          description: "Remove this saved direct link.",
        });
        known.add(id);
      }
    }
  return options.filter((option) =>
    target.mode === "remove"
      ? direct.has(option.id)
      : !plans.every((audience) =>
          audience.items.some((item) => learningItemKey(item) === option.id),
        ),
  );
}
