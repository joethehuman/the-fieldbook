import type { BulkCommand } from "./patterns/bulk-actions";
import type { OpenLearningAssignment } from "./use-learning-assignment-picker";
import type { UpdateAssignmentTarget } from "@/lib/update-assignment-selection";

/** Shared course actions, plus live Update recommendations on group menus. */
export function audienceAssignmentCommands(
  keys: string[],
  title: string,
  openLearning: OpenLearningAssignment,
  openUpdates?: (
    target: UpdateAssignmentTarget,
    title: string,
  ) => Promise<void>,
  disabledReason?: string,
): BulkCommand[] {
  const kinds: ("learning" | "updates")[] = openUpdates
    ? ["learning", "updates"]
    : ["learning"];
  return kinds.flatMap((kind) =>
    (["add", "remove"] as const).map((mode) => ({
      id: `${mode}-${kind}`,
      label: `${mode === "add" ? "Assign" : "Remove"} ${kind === "learning" ? "courses" : "updates"}`,
      description:
        kind === "learning"
          ? "Change direct course or curriculum assignments. Other assignment sources and saved history remain."
          : "Change Update recommendations. Published Updates remain available throughout the installation.",
      externalReview: true,
      disabledReason,
      apply: () =>
        kind === "learning"
          ? openLearning({ kind: "audiences", keys, mode }, title)
          : openUpdates!({ kind: "audiences", keys, mode }, title),
    })),
  );
}
