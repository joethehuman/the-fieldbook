import type { Assignment, Content } from "./types";
export type LearningAction = {
  operation:
    "assign" | "unassign" | "complete" | "reset" | "target" | "untarget";
  contentId: string;
  expected: number;
  groupId?: string;
  teamId?: string;
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
export function assignmentKey(a: {
  groupId?: string;
  teamId?: string;
  userId?: string;
}) {
  return a.groupId
    ? `group:${a.groupId}`
    : a.teamId
      ? `team:${a.teamId}`
      : `user:${a.userId}`;
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
type ClockPerson = Pick<
  User,
  "id" | "hireDate" | "onboardingStart" | "onboardingDays"
>;
export function onboardingClockTarget(
  user: ClockPerson,
  settings?: SiteSettings,
) {
  if (user.id === "guest") return undefined;
  const start = user.hireDate || user.onboardingStart;
  return start
    ? addDays(start, user.onboardingDays ?? settings?.onboardingDays ?? 90)
    : undefined;
}
export function learningStage(
  user: ClockPerson,
  settings?: SiteSettings,
  day = todayUTC(),
) {
  const target = onboardingClockTarget(user, settings);
  return target && target >= day ? "New user" : "Existing user";
}
export function onboardingTarget(user: User, settings?: SiteSettings) {
  return settings?.dueDatesEnabled === false
    ? undefined
    : onboardingClockTarget(user, settings);
}
export function learningTarget(
  c: Content,
  user: User,
  groups: Group[],
  settings?: SiteSettings,
) {
  if (user.id === "guest" || settings?.dueDatesEnabled === false)
    return undefined;
  const saved = user.learningAssignments?.find(
    (a) => a.contentId === c.id && a.version === c.version,
  );
  if (saved) return saved.dueDate;
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
  // Saved group order gives overlapping audiences a deterministic sequence.
  // The hierarchy upgrade records the former ancestor-first order here.
  const orderedGroups = groups.filter((g) => memberships.has(g.id));
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
  for (const team of user.assignmentTeams || []) {
    const ids =
      team.requiredCourseIds ||
      (team.learningItems || [])
        .filter((i) => i.kind === "course")
        .map((i) => i.id);
    const courses = required.filter((c) =>
      assignmentRules(c).some((a) => a.teamId === team.id),
    );
    courses.sort(
      (a, b) =>
        (ids.includes(a.id) ? ids.indexOf(a.id) : 99999) -
          (ids.includes(b.id) ? ids.indexOf(b.id) : 99999) ||
        a.title.localeCompare(b.title),
    );
    for (const course of courses)
      if (!seen.has(course.id)) {
        seen.add(course.id);
        result.push(course);
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
    onboarding = learningStage(user, settings) === "New user";
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
            : settings?.dueDatesEnabled === false
              ? "In progress"
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
