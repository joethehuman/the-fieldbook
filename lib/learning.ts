import type { Assignment, Content } from "./types";
export type LearningAction = {
  operation:
    "assign" | "unassign" | "complete" | "reset" | "target" | "untarget";
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

import {
  assignmentInfo,
  assignedCourses,
  ancestorIds,
  effectiveGroups,
  isComplete,
  type Group,
  type User,
  type Progress,
} from "./types";
import type { SiteSettings } from "./settings";
export const todayUTC = () => new Date().toISOString().slice(0, 10);
export function addDays(day: string, days: number) {
  const d = new Date(day.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function onboardingTarget(user: User, settings?: SiteSettings) {
  return user.onboardingStart
    ? addDays(user.onboardingStart, settings?.onboardingDays ?? 90)
    : undefined;
}
export function learningTarget(
  c: Content,
  user: User,
  groups: Group[],
  settings?: SiteSettings,
) {
  const started = assignmentInfo(c, user, groups).assignedAt;
  if (!started) return undefined;
  const catchUp = addDays(started, settings?.catchUpDays ?? 30),
    onboarding = onboardingTarget(user, settings);
  return onboarding && onboarding > catchUp ? onboarding : catchUp;
}
export function requiredSequence(
  content: Content[],
  user: User,
  groups: Group[],
) {
  const required = assignedCourses(content, user, groups),
    memberships = effectiveGroups(user, groups);
  const orderedGroups = groups
    .filter((g) => memberships.has(g.id))
    .sort(
      (a, b) =>
        ancestorIds(a.id, groups).size - ancestorIds(b.id, groups).size ||
        a.name.localeCompare(b.name),
    );
  const seen = new Set<string>(),
    result: Content[] = [];
  for (const g of orderedGroups) {
    const courses = required.filter((c) =>
      assignmentRules(c).some((a) => a.groupId === g.id),
    );
    const ids = g.requiredCourseIds || [];
    courses.sort((a, b) => {
      const ai = ids.indexOf(a.id),
        bi = ids.indexOf(b.id);
      return (
        (ai < 0 ? 99999 : ai) - (bi < 0 ? 99999 : bi) ||
        a.title.localeCompare(b.title)
      );
    });
    for (const c of courses)
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
  }
  return result;
}
export function learningState(
  content: Content[],
  user: User,
  groups: Group[],
  progress: Progress[],
  settings?: SiteSettings,
) {
  const required = requiredSequence(content, user, groups),
    remaining = required.filter((c) => !isComplete(c, progress));
  const target = onboardingTarget(user, settings),
    onboarding = !!target && target >= todayUTC();
  const overdue = remaining.filter(
    (c) => (learningTarget(c, user, groups, settings) || "9999") < todayUTC(),
  );
  return {
    required,
    remaining,
    target,
    onboarding,
    overdue,
    status: !required.length
      ? "No assigned courses"
      : !remaining.length
        ? "Complete"
        : overdue.length
          ? "Needs attention"
          : onboarding
            ? "Getting started"
            : "On track",
  };
}

// A rounded percentage must never claim completion while a course remains.
export function completionPercent(completed: number, total: number) {
  if (!total) return 0;
  return completed >= total
    ? 100
    : Math.min(99, Math.round((completed / total) * 100));
}
