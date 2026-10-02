import {
  assignmentAudiences,
  audienceKey,
  assignLearningToAudiences,
} from "@/lib/assignment-audiences";
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
    label: kind === "brief" ? (add ? "Add relevant groups" : "Remove relevant groups") : add
      ? "Assign to teams or groups"
      : "Remove team or group assignments",
    disabledReason: reason,
    description: add
      ? "Add direct learning assignments or Update audiences. Overlapping courses count once. Existing history is preserved."
      : "Remove direct links only. Learning inherited through a curriculum or another team or group remains; saved history is preserved.",
    options:
      kind === "brief"
        ? data.groups.map((g) => ({ id: g.id, label: `Group: ${g.name}` }))
        : assignmentAudiences(data).map((a) => ({
            id: audienceKey(a),
            label: `${a.kind === "group" ? "Group" : "Team"}: ${a.name}`,
          })),
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
      await save(
        assignLearningToAudiences(
          data,
          selected.map((id) => ({ kind: "course", id })),
          ids,
          add ? "add" : "remove",
        ),
      );
    },
  }));
  if (kind === "course")
    commands.push({
      id: "curriculum-add",
      label: "Add to curricula",
      disabledReason: reason,
      description:
        "Append these courses without duplicates. Teams and groups using these curricula receive the added courses; history is preserved.",
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
    label: add
      ? "Assign to teams or groups"
      : "Remove team or group assignments",
    description:
      "Change direct curriculum assignments. Course content and saved learning history are preserved.",
    disabledReason:
      add &&
      data.curricula?.some(
        (c) => selected.includes(c.id) && c.status !== "published",
      )
        ? "Publish every selected curriculum first."
        : undefined,
    options: assignmentAudiences(data).map((a) => ({
      id: audienceKey(a),
      label: `${a.kind === "group" ? "Group" : "Team"}: ${a.name}`,
    })),
    apply: async (ids) => {
      await save(
        assignLearningToAudiences(
          data,
          selected.map((id) => ({ kind: "curriculum", id })),
          ids,
          add ? "add" : "remove",
        ),
      );
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
