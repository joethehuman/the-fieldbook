import type { Workspace } from "../store";
import type { User } from "../types";
import { todayUTC } from "../learning";
import { defaultSettings } from "../settings";
import { hooliDemoData } from "./hooli";

// Preserve the sample's scenarios relative to this day, using the real clock
// and unchanged shared deadline rules. The administrator has a course due in
// five days alongside overdue courses; the learner is still a new hire.
export const DEMO_LEARNING_DAY = "2026-09-30";
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;
function shift(value: string | undefined, days: number) {
  if (!value) return value;
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return value.length === 10
    ? date.toISOString().slice(0, 10)
    : date.toISOString();
}
function membershipsMatch(
  current: Record<string, string> | undefined,
  original: Record<string, string> | undefined,
  offset: number,
) {
  const keys = Object.keys(original || {});
  return (
    keys.length === Object.keys(current || {}).length &&
    keys.every((id) => current?.[id] === shift(original?.[id], offset))
  );
}
function shiftMemberships(
  dates: Record<string, string> | undefined,
  offset: number,
) {
  return (
    dates &&
    Object.fromEntries(
      Object.entries(dates).map(([id, date]) => [id, shift(date, offset)!]),
    )
  );
}
function sameClock(person: User, original: User, previousOffset: number) {
  return (
    person.hireDate === shift(original.hireDate, previousOffset) &&
    person.onboardingStart ===
      shift(original.onboardingStart, previousOffset) &&
    person.onboardingDays === original.onboardingDays &&
    person.teamId === original.teamId &&
    [...person.groups].sort().join("\n") ===
      [...original.groups].sort().join("\n") &&
    membershipsMatch(
      person.groupJoinedAt,
      original.groupJoinedAt,
      previousOffset,
    ) &&
    membershipsMatch(
      person.effectiveGroupJoinedAt,
      original.effectiveGroupJoinedAt,
      previousOffset,
    )
  );
}

/** Refresh recognizable sample learning dates; never replace visitor records. */
export function refreshDemoLearningTimeline(
  data: Workspace,
  day = todayUTC(),
): Workspace {
  if (data.demoLearningDay === day) return data;
  const previousOffset =
    dayNumber(data.demoLearningDay || DEMO_LEARNING_DAY) -
    dayNumber(DEMO_LEARNING_DAY);
  const offset = dayNumber(day) - dayNumber(DEMO_LEARNING_DAY);
  const people = new Map(
    hooliDemoData.users.map((person) => [person.id, person]),
  );
  const settings = { ...defaultSettings, ...hooliDemoData.settings };
  const sameWindows =
    (data.settings?.catchUpDays ?? defaultSettings.catchUpDays) ===
      settings.catchUpDays &&
    (data.settings?.onboardingDays ?? defaultSettings.onboardingDays) ===
      settings.onboardingDays;
  const users = data.users.map((person) => {
    const original = people.get(person.id);
    // Edited clocks, memberships and organization windows keep their real dates.
    if (
      !original ||
      !sameWindows ||
      !sameClock(person, original, previousOffset)
    )
      return person;
    return {
      ...person,
      ...(original.hireDate
        ? { hireDate: shift(original.hireDate, offset) }
        : {}),
      ...(original.onboardingStart
        ? { onboardingStart: shift(original.onboardingStart, offset) }
        : {}),
      groupJoinedAt: shiftMemberships(original.groupJoinedAt, offset),
      effectiveGroupJoinedAt: shiftMemberships(
        original.effectiveGroupJoinedAt,
        offset,
      ),
      learningAssignments: person.learningAssignments?.map((assignment) => {
        const sample = original.learningAssignments?.find(
          (item) => item.episodeId === assignment.episodeId,
        );
        // Reassigned courses, new versions and edited deadlines age normally.
        if (
          !sample ||
          assignment.contentId !== sample.contentId ||
          assignment.version !== sample.version ||
          assignment.assignedAt !== shift(sample.assignedAt, previousOffset) ||
          assignment.dueDate !== shift(sample.dueDate, previousOffset) ||
          assignment.onboardingEnd !==
            shift(sample.onboardingEnd, previousOffset) ||
          assignment.catchUpDays !== sample.catchUpDays
        )
          return assignment;
        return {
          ...assignment,
          assignedAt: shift(sample.assignedAt, offset)!,
          dueDate: shift(sample.dueDate, offset)!,
          ...(sample.onboardingEnd
            ? { onboardingEnd: shift(sample.onboardingEnd, offset) }
            : {}),
        };
      }),
    };
  });
  return { ...data, users, demoLearningDay: day };
}
