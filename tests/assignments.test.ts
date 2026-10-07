import assert from "node:assert/strict";
import { test } from "node:test";
import {
  learningState,
  learningTarget,
  onboardingTarget,
  requiredSequence,
} from "../lib/learning";
import { defaultSettings } from "../lib/settings";
import { assignedCourses } from "../lib/types";
import { legacyWorkspace as freshWorkspace } from "./fixtures/legacy-workspace";
const admin = "00000000-0000-4000-8000-000000000001",
  learner = "00000000-0000-4000-8000-000000000002",
  cid = "00000000-0000-4000-8000-000000000003";
test("overlapping independent group requirements count once; individual rules do not require courses", () => {
  const data = freshWorkspace();
  const user = {
    ...data.users[0],
    hireDate: undefined,
    onboardingStart: undefined,
    groups: ["sales", "startup"],
    groupJoinedAt: {
      sales: "2026-09-20T00:00:00Z",
      startup: "2026-09-20T00:00:00Z",
    },
  };
  const groups = [
    { id: "sales", name: "Sales" },
    { id: "startup", name: "Startup" },
  ];
  const course = {
    ...data.content.find((c) => c.kind === "course")!,
    assignments: [
      {
        groupId: "sales",
        assignedAt: "2026-09-01T00:00:00Z",
        due: { type: "none" as const },
      },
      {
        groupId: "startup",
        assignedAt: "2026-09-25T00:00:00Z",
        due: { type: "none" as const },
      },
      // Historical data must not revive retired individual requirements.
      {
        userId: user.id,
        assignedAt: "2026-09-01T00:00:00Z",
        due: { type: "date" as const, date: "2026-09-22" },
      },
    ],
  };
  assert.equal(assignedCourses([course], user, groups).length, 1);
  assert.deepEqual(
    requiredSequence([course], user, groups).map((c) => c.id),
    [course.id],
  );
  assert.equal(learningTarget(course, user, groups), "2026-10-20");
  assert.equal(
    assignedCourses([course], { ...user, groups: [] }, groups).length,
    0,
  );
  assert.equal(
    learningTarget(course, { ...user, groups: [] }, groups),
    undefined,
  );
});

test("completion targets preserve the applied onboarding window and use the later catch-up window", () => {
  const data = freshWorkspace();
  const user = {
    ...data.users[0],
    hireDate: undefined,
    onboardingDays: 90,
    onboardingStart: "2026-09-01",
    groups: ["sales"],
    groupJoinedAt: { sales: "2026-09-20T00:00:00Z" },
  };
  const course = {
    ...data.content.find((c) => c.kind === "course")!,
    assignments: [
      {
        groupId: "sales",
        assignedAt: "2026-09-01T00:00:00Z",
        due: { type: "none" as const },
      },
    ],
  };
  assert.equal(learningTarget(course, user, data.groups), "2026-11-30");
  const existingUser = { ...user, onboardingStart: undefined };
  assert.equal(learningTarget(course, existingUser, data.groups), "2026-10-20");
  assert.equal(
    learningTarget(course, existingUser, data.groups, {
      ...defaultSettings,
      catchUpDays: 14,
    }),
    "2026-10-04",
  );
  assert.equal(
    learningTarget(course, user, data.groups, {
      ...defaultSettings,
      onboardingDays: 30,
    }),
    "2026-11-30",
  );
  const newlyRequired = {
    ...course,
    assignments: [
      { ...course.assignments[0], assignedAt: "2026-11-20T00:00:00Z" },
    ],
  };
  assert.equal(learningTarget(newlyRequired, user, data.groups), "2026-12-20");
  const withoutDueDates = { ...defaultSettings, dueDatesEnabled: false };
  assert.equal(
    learningTarget(course, user, data.groups, withoutDueDates),
    undefined,
  );
  assert.equal(onboardingTarget(user, withoutDueDates), undefined);
  const state = learningState(
    [course],
    existingUser,
    data.groups,
    [],
    withoutDueDates,
  );
  assert.equal(state.required.length, 1);
  assert.equal(state.remaining.length, 1);
  assert.deepEqual(state.overdue, []);
  assert.equal(state.status, "In progress");
});
