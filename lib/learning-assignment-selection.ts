import type { Workspace } from "./store";
import type { LearningItem } from "./types";
import {
  assignmentAudiences,
  assignLearningToAudiences,
} from "./assignment-audiences";
import { sourcePassages } from "./search";

export type LearningAssignmentTarget =
  | { kind: "items"; items: LearningItem[]; mode: "add" | "remove" | "manage" }
  | {
      kind: "audiences";
      keys: string[];
      mode: "add" | "remove" | "manage";
      selected?: string[];
      omit?: string[];
    };

export const learningItemKey = (item: LearningItem) =>
  `${item.kind}:${item.id}`;
export type AssignmentSelection = { selected: string[]; partial: string[] };
export function learningSelectionState(
  data: Workspace,
  target: LearningAssignmentTarget,
): AssignmentSelection {
  if (target.mode !== "manage") return { selected: [], partial: [] };
  if (target.kind === "items") {
    const plans = assignmentAudiences(data)
      .map((plan) => ({
        key: `${plan.kind}:${plan.id}`,
        count: target.items.filter((item) =>
          plan.items.some(
            (saved) => learningItemKey(saved) === learningItemKey(item),
          ),
        ).length,
      }))
      .filter((plan) => plan.count > 0);
    return {
      selected: plans.map((plan) => plan.key),
      partial: plans
        .filter((plan) => plan.count < target.items.length)
        .map((plan) => plan.key),
    };
  }
  const plans = assignmentAudiences(data).filter((a) =>
    target.keys.includes(`${a.kind}:${a.id}`),
  );
  const selected = [
    ...new Set(plans.flatMap((a) => a.items.map(learningItemKey))),
  ];
  return {
    selected,
    partial: selected.filter(
      (id) =>
        plans.filter((a) =>
          a.items.some((item) => learningItemKey(item) === id),
        ).length < plans.length,
    ),
  };
}
/** Retain local intentions while accepting untouched assignments from a refreshed snapshot. */
export function rebaseAssignmentSelection(
  before: AssignmentSelection,
  after: AssignmentSelection,
  current: AssignmentSelection,
): AssignmentSelection {
  const touched = new Set(
    [...before.selected, ...current.selected].filter(
      (id) =>
        before.selected.includes(id) !== current.selected.includes(id) ||
        before.partial.includes(id) !== current.partial.includes(id),
    ),
  );
  return {
    selected: [
      ...new Set([
        ...after.selected.filter((id) => !touched.has(id)),
        ...current.selected.filter((id) => touched.has(id)),
      ]),
    ],
    partial: [
      ...new Set([
        ...after.partial.filter((id) => !touched.has(id)),
        ...current.partial.filter((id) => touched.has(id)),
      ]),
    ],
  };
}
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
  partial: string[] = [],
) {
  if (target.kind === "items" && target.mode === "manage") {
    const plans = assignmentAudiences(data);
    const original = learningSelectionState(data, target);
    if (
      !target.items.length ||
      values.some(
        (key) => !plans.some((plan) => `${plan.kind}:${plan.id}` === key),
      ) ||
      partial.some(
        (key) => !values.includes(key) || !original.partial.includes(key),
      )
    )
      throw new Error(
        "Learning or audiences changed. Refresh to review the current selection.",
      );
    let next = data;
    for (const plan of plans) {
      const key = `${plan.kind}:${plan.id}`;
      if (partial.includes(key)) continue;
      const saved = (item: LearningItem) =>
        plan.items.some(
          (existing) => learningItemKey(existing) === learningItemKey(item),
        );
      const items = target.items.filter((item) =>
        values.includes(key) ? !saved(item) : saved(item),
      );
      if (items.length)
        next = assignLearningToAudiences(
          next,
          items,
          [key],
          values.includes(key) ? "add" : "remove",
        );
    }
    return next;
  }
  if (target.kind === "audiences" && target.mode === "manage") {
    const plans = assignmentAudiences(data).filter((a) =>
      target.keys.includes(`${a.kind}:${a.id}`),
    );
    const options = learningSelectionOptions(data, target);
    const original = learningSelectionState(data, target);
    if (
      !target.keys.length ||
      plans.length !== new Set(target.keys).size ||
      values.some((id) => !options.some((option) => option.id === id)) ||
      partial.some(
        (id) => !values.includes(id) || !original.partial.includes(id),
      )
    )
      throw new Error(
        "Learning or audiences changed. Refresh to review the current selection.",
      );
    let next = data;
    for (const plan of plans) {
      const key = `${plan.kind}:${plan.id}`;
      const added = selectedLearningItems(
        target,
        values.filter(
          (id) =>
            !partial.includes(id) &&
            !plan.items.some((item) => learningItemKey(item) === id),
        ),
      );
      const removed = plan.items.filter(
        (item) => !values.includes(learningItemKey(item)),
      );
      if (added.length)
        next = assignLearningToAudiences(next, added, [key], "add");
      if (removed.length)
        next = assignLearningToAudiences(next, removed, [key], "remove");
    }
    return next;
  }
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
  return assignLearningToAudiences(
    data,
    items,
    keys,
    target.mode === "remove" ? "remove" : "add",
  );
}

type LearningSelectionOption = {
  id: string;
  label: string;
  type?: "course" | "curriculum" | "team" | "group";
  description?: string;
  category?: string;
  updatedAt?: string;
  searchText?: string;
  assignmentCount?: number;
  includedItems?: { id: string; label: string }[];
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
          target.mode !== "remove" ||
          target.items.some((item) =>
            audience.items.some(
              (saved) => learningItemKey(saved) === learningItemKey(item),
            ),
          ),
      )
      .map((audience) => ({
        id: `${audience.kind}:${audience.id}`,
        label:
          target.mode === "manage"
            ? audience.name
            : `${audience.kind === "team" ? "Team" : "Group"}: ${audience.name}`,
        type: audience.kind,
        assignmentCount: target.items.filter((item) =>
          audience.items.some(
            (saved) => learningItemKey(saved) === learningItemKey(item),
          ),
        ).length,
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
      (target.mode !== "add" && direct.has(`course:${item.id}`)),
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
          (target.mode !== "add" && direct.has(`curriculum:${item.id}`)),
      )
      .map((item) => ({
        id: `curriculum:${item.id}`,
        label: item.name,
        type: "curriculum" as const,
        includedItems: item.courseIds.map((id) => ({
          id: `course:${id}`,
          label:
            content.find((c) => c.id === id)?.title || "Unavailable course",
        })),
        description: item.description,
        searchText: item.courseIds
          .map((id) => searchable.get(id) || "")
          .join(" "),
      })),
  ];
  const known = new Set(options.map((option) => option.id));
  if (target.mode !== "add")
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
  if (target.mode === "manage")
    return options.map((option) => ({
      ...option,
      assignmentCount: plans.filter((plan) =>
        plan.items.some((item) => learningItemKey(item) === option.id),
      ).length,
    }));
  return options.filter((option) =>
    target.mode === "remove"
      ? direct.has(option.id)
      : !plans.every((audience) =>
          audience.items.some((item) => learningItemKey(item) === option.id),
        ),
  );
}
