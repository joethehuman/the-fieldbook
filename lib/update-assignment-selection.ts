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
      mode: "add" | "remove" | "manage";
      selected?: string[];
      omit?: string[];
    }
  | { kind: "items"; ids: string[]; mode: "add" | "remove" | "manage" };

export function editsCompleteUpdateSelection(target: UpdateAssignmentTarget) {
  return (
    target.mode === "manage" ||
    (target.mode === "add" &&
      (target.kind === "items"
        ? target.ids.length === 1
        : target.keys.length === 1))
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
    return [
      ...new Set(
        updates(data)
          .filter((item) => target.ids.includes(item.id))
          .flatMap((item) => item.groups.map((id) => `group:${id}`)),
      ),
    ];
  }
  return updates(data)
    .filter((item) =>
      target.keys.some((key) => updateAudienceKeys(item).includes(key)),
    )
    .map((item) => item.id);
}

export function partialUpdateSelection(
  data: Workspace,
  target: UpdateAssignmentTarget,
) {
  if (target.mode !== "manage") return [];
  const published = updates(data);
  return initialUpdateSelection(data, target).filter((value) =>
    target.kind === "items"
      ? published.filter(
          (item) =>
            target.ids.includes(item.id) &&
            updateAudienceKeys(item).includes(value),
        ).length < target.ids.length
      : target.keys.filter((key) =>
          updateAudienceKeys(
            published.find((item) => item.id === value)!,
          ).includes(key),
        ).length < target.keys.length,
  );
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
          (target.mode !== "remove" ||
            items.some((item) => item.groups.includes(audience.id))),
      )
      .map((audience) => ({
        id: contentAudienceKey(audience),
        label: audience.name,
        type: audience.kind,
        assignmentCount: items.filter((item) =>
          item.groups.includes(audience.id),
        ).length,
        description: audience.organization
          ? "Everyone registered, now and in future"
          : undefined,
      }));
  }
  return published
    .filter(
      (item) =>
        target.mode !== "remove" ||
        target.keys.some((key) => updateAudienceKeys(item).includes(key)),
    )
    .map((item) => ({
      id: item.id,
      label: item.title,
      type: "update" as const,
      assignmentCount: target.keys.filter((key) =>
        updateAudienceKeys(item).includes(key),
      ).length,
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
  partial: string[] = [],
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
  if (
    partial.some(
      (id) =>
        !values.includes(id) ||
        !partialUpdateSelection(data, target).includes(id),
    )
  )
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
      if (target.mode === "manage" && partial.includes(value)) return [];
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
