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
  return kinds.map((kind) => ({
    id: `manage-${kind}`,
    label: kind === "learning" ? "Manage Courses" : "Manage Updates",
    description:
      kind === "learning"
        ? "Manage direct course and curriculum assignments. Other sources and saved history remain."
        : "Manage Update recommendations. Published Updates remain available throughout the installation.",
    externalReview: true,
    disabledReason,
    apply: () =>
      kind === "learning"
        ? openLearning({ kind: "audiences", keys, mode: "manage" }, title)
        : openUpdates!({ kind: "audiences", keys, mode: "manage" }, title),
  }));
}
