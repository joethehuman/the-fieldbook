import type { Assignment, Content } from "./types";
export type LearningAction = {
  operation: "assign" | "unassign" | "complete" | "reset";
  contentId: string;
  expected: number;
  groupId?: string;
  userId?: string;
  due?: Assignment["due"];
  version?: number;
  progressExpected?: number;
};
export function assignmentRules(c: Content): Assignment[] {
  return (
    c.assignments ??
    c.groups.map((groupId) => ({
      groupId,
      assignedAt: c.createdAt || c.updatedAt,
      due: { type: "none" },
    }))
  );
}
export function assignmentKey(a: { groupId?: string; userId?: string }) {
  return a.groupId ? `group:${a.groupId}` : `user:${a.userId}`;
}
export function deadlineLabel(due: Assignment["due"]) {
  return due.type === "date"
    ? due.date
    : due.type === "days"
      ? `Within ${due.days} days`
      : "No deadline";
}
