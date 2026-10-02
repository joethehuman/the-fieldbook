import type { Workspace } from "@/lib/store";
import { groupItems } from "@/lib/learning-groups";
import type { LearningAction } from "@/lib/learning";
import type { BulkCommand } from "./patterns/bulk-actions";
type Save = (data: Workspace) => void | Promise<void>;
export type LearningMany = (actions: LearningAction[]) => Promise<void>;
export function contentRelationshipCommands(
  data: Workspace,
  selected: string[],
  save: Save,
  learn: LearningMany,
): BulkCommand[] {
  const records = data.content.filter((c) => selected.includes(c.id));
  const kind = records[0]?.kind;
  if (
    !records.length ||
    !records.every((c) => c.kind === kind) ||
    kind === "doc"
  )
    return [];
  const published = data.publishedContent || data.content;
  const reason = records.some(
    (c) => !published.some((p) => p.id === c.id && p.status === "published"),
  )
    ? "Publish every selected item before changing group assignments or audiences."
    : undefined;
  const commands: BulkCommand[] = ([true, false] as const).map((add) => ({
    id: add ? "group-add" : "group-remove",
    label: add ? "Add to learning groups" : "Remove from learning groups",
    disabledReason: reason,
    applyLabel: "Review changes",
    description: add
      ? "Add direct learning assignments or Update audiences. Overlapping courses count once. Existing history is preserved."
      : "Remove direct links only. Learning inherited through a curriculum or another group remains; saved history is preserved.",
    options: data.groups.map((g) => ({ id: g.id, label: g.name })),
    apply: async (ids) => {
      if (kind === "brief") {
        await learn(
          records.flatMap((c) =>
            ids.map((groupId) => ({
              operation: add ? ("target" as const) : ("untarget" as const),
              contentId: c.id,
              groupId,
              expected: c.revision || 0,
            })),
          ),
        );
        return;
      }
      await save({
        ...data,
        groups: data.groups.map((g) =>
          !ids.includes(g.id)
            ? g
            : {
                ...g,
                learningItems: add
                  ? [
                      ...groupItems(g, published),
                      ...selected
                        .filter(
                          (id) =>
                            !groupItems(g, published).some(
                              (i) => i.kind === "course" && i.id === id,
                            ),
                        )
                        .map((id) => ({ kind: "course" as const, id })),
                    ]
                  : groupItems(g, published).filter(
                      (i) => i.kind !== "course" || !selected.includes(i.id),
                    ),
              },
        ),
      });
    },
  }));
  if (kind === "course")
    commands.push({
      id: "curriculum-add",
      label: "Add to curricula",
      disabledReason: reason,
      applyLabel: "Review changes",
      description:
        "Append these courses without duplicates. Learning groups using these curricula receive the added courses; history is preserved.",
      options: (data.curricula || []).map((c) => ({ id: c.id, label: c.name })),
      apply: async (ids) => {
        await save({
          ...data,
          curricula: data.curricula?.map((c) =>
            ids.includes(c.id)
              ? { ...c, courseIds: [...new Set([...c.courseIds, ...selected])] }
              : c,
          ),
        });
      },
    });
  return commands;
}
export function curriculumGroupCommands(
  data: Workspace,
  selected: string[],
  save: Save,
): BulkCommand[] {
  return ([true, false] as const).map((add) => ({
    id: add ? "group-add" : "group-remove",
    label: add ? "Add to learning groups" : "Remove from learning groups",
    applyLabel: "Review assignments",
    description:
      "Change direct curriculum assignments. Course content and saved learning history are preserved.",
    disabledReason:
      add &&
      data.curricula?.some(
        (c) => selected.includes(c.id) && c.status !== "published",
      )
        ? "Publish every selected curriculum first."
        : undefined,
    options: data.groups.map((g) => ({ id: g.id, label: g.name })),
    apply: async (ids) => {
      await save({
        ...data,
        groups: data.groups.map((g) =>
          !ids.includes(g.id)
            ? g
            : {
                ...g,
                learningItems: add
                  ? [
                      ...groupItems(g, data.publishedContent || data.content),
                      ...selected
                        .filter(
                          (id) =>
                            !groupItems(
                              g,
                              data.publishedContent || data.content,
                            ).some(
                              (i) => i.kind === "curriculum" && i.id === id,
                            ),
                        )
                        .map((id) => ({ kind: "curriculum" as const, id })),
                    ]
                  : groupItems(g, data.publishedContent || data.content).filter(
                      (i) =>
                        i.kind !== "curriculum" || !selected.includes(i.id),
                    ),
              },
        ),
      });
    },
  }));
}
export function groupLearningCommands(
  data: Workspace,
  selected: string[],
  save: Save,
  learn: LearningMany,
): BulkCommand[] {
  const content = (data.publishedContent || data.content).filter(
    (c) => c.status === "published",
  );
  return ([true, false] as const).flatMap((add) => [
    {
      id: `learning-${add}`,
      label: add ? "Add courses or curricula" : "Remove courses or curricula",
      description:
        "Change direct learning assignments for the selected groups. Overlapping courses count once; inherited assignments and history remain.",
      options: [
        ...content
          .filter((c) => c.kind === "course")
          .map((c) => ({
            id: `course:${c.id}`,
            label: c.title,
            description: "Course",
          })),
        ...(data.curricula || [])
          .filter((c) => c.status === "published")
          .map((c) => ({
            id: `curriculum:${c.id}`,
            label: c.name,
            description: "Curriculum",
          })),
      ],
      apply: async (ids: string[]) => {
        const chosen = ids.map((id) => ({
          kind: id.startsWith("course:")
            ? ("course" as const)
            : ("curriculum" as const),
          id: id.slice(id.indexOf(":") + 1),
        }));
        await save({
          ...data,
          groups: data.groups.map((g) => {
            if (!selected.includes(g.id)) return g;
            const existing = groupItems(g, content);
            return {
              ...g,
              learningItems: add
                ? [
                    ...existing,
                    ...chosen.filter(
                      (i) =>
                        !existing.some(
                          (e) => e.id === i.id && e.kind === i.kind,
                        ),
                    ),
                  ]
                : existing.filter(
                    (e) =>
                      !chosen.some((i) => i.id === e.id && i.kind === e.kind),
                  ),
            };
          }),
        });
      },
    },
    {
      id: `updates-${add}`,
      label: add ? "Add Updates" : "Remove Updates",
      description:
        "Change the selected groups’ direct Update audiences. Published Updates remain available throughout the installation.",
      options: content
        .filter((c) => c.kind === "brief")
        .map((c) => ({ id: c.id, label: c.title })),
      apply: async (ids: string[]) => {
        await learn(
          ids.flatMap((contentId) =>
            selected.map((groupId) => ({
              operation: add ? ("target" as const) : ("untarget" as const),
              contentId,
              groupId,
              expected:
                data.content.find((c) => c.id === contentId)?.revision || 0,
            })),
          ),
        );
      },
    },
  ]);
}
