import type { Workspace } from "./store";
import type { LearningAction } from "./learning";
import {
  audienceOptions,
  contentAudienceKey,
  updateAudienceKeys,
} from "./content-audiences";
import { sourcePassages } from "./search";

export type UpdateAssignmentTarget =
  | {
      kind: "audiences";
      keys: string[];
      mode: "add" | "remove";
      selected?: string[];
    }
  | { kind: "items"; ids: string[]; mode: "add" | "remove" };

export function editsCompleteUpdateSelection(target: UpdateAssignmentTarget) {
  return (
    target.mode === "add" &&
    (target.kind === "items"
      ? target.ids.length === 1
      : target.keys.length === 1)
  );
}

function updates(data: Workspace) {
  return (data.publishedContent || data.content).filter(
    (item) => item.kind === "brief" && item.status === "published",
  );
}

export function initialUpdateSelection(
  data: Workspace,
  target: UpdateAssignmentTarget,
): string[] {
  if (!editsCompleteUpdateSelection(target)) return [];
  if (target.kind === "items") {
    const item = updates(data).find((item) => item.id === target.ids[0]);
    return item ? item.groups.map((id) => `group:${id}`) : [];
  }
  return updates(data)
    .filter((item) => updateAudienceKeys(item).includes(target.keys[0]))
    .map((item) => item.id);
}

export function updateSelectionOptions(
  data: Workspace,
  target: UpdateAssignmentTarget,
) {
  const published = updates(data);
  if (target.kind === "items") {
    const items = published.filter((item) => target.ids.includes(item.id));
    return audienceOptions(data)
      .filter(
        (audience) =>
          audience.kind === "group" &&
          (target.mode === "add" ||
            items.some((item) => item.groups.includes(audience.id))),
      )
      .map((audience) => ({
        id: contentAudienceKey(audience),
        label: audience.name,
        type: audience.kind,
        description: audience.organization
          ? "Everyone registered, now and in future"
          : undefined,
      }));
  }
  return published
    .filter(
      (item) =>
        target.mode === "add" ||
        target.keys.some((key) => updateAudienceKeys(item).includes(key)),
    )
    .map((item) => ({
      id: item.id,
      label: item.title,
      type: "update" as const,
      description: item.summary,
      searchText: sourcePassages(item)
        .map((passage) => passage.text)
        .join(" "),
    }));
}

/** Live group recommendations use the existing action. Team targeting stays in the Update editor. */
export function updateSelectionActions(
  data: Workspace,
  target: UpdateAssignmentTarget,
  values: string[],
): LearningAction[] {
  const published = updates(data);
  const knownAudiences = new Set(
    data.groups.map((group) => `group:${group.id}`),
  );
  const available = new Set(
    updateSelectionOptions(data, target).map((option) => option.id),
  );
  if (values.some((value) => !available.has(value)))
    throw new Error("Updates or audiences changed. Refresh the current list.");
  const complete = editsCompleteUpdateSelection(target);
  const selected = new Set(values);
  const initial = initialUpdateSelection(data, target);
  const ids =
    target.kind === "items"
      ? target.ids
      : [...new Set([...initial, ...values])];
  const keys =
    target.kind === "audiences"
      ? target.keys
      : [...new Set([...initial, ...values])];
  if (!ids.length || !keys.length) return [];
  if (
    keys.some((key) => !knownAudiences.has(key)) ||
    ids.some((id) => !published.some((item) => item.id === id))
  )
    throw new Error("Updates or audiences changed. Refresh the current list.");
  return [...new Set(ids)].flatMap((id) => {
    const item = published.find((item) => item.id === id)!;
    const expected =
      data.content.find((item) => item.id === id)?.revision ??
      item.revision ??
      0;
    const current = new Set(updateAudienceKeys(item));
    return [...new Set(keys)].flatMap((key): LearningAction[] => {
      const value = target.kind === "items" ? key : id;
      const shouldInclude = complete
        ? selected.has(value)
        : target.mode === "add";
      if (current.has(key) === shouldInclude) return [];
      const audienceId = key.slice(key.indexOf(":") + 1);
      return [
        {
          operation: shouldInclude ? "target" : "untarget",
          contentId: id,
          expected,
          groupId: audienceId,
        },
      ];
    });
  });
}

export function updateSelectionSnapshot(data: Workspace) {
  return JSON.stringify([
    data.governanceRevision,
    data.revision,
    data.content,
    data.publishedContent,
    data.groups,
    data.teams,
    data.users,
    data.settings,
  ]);
}
