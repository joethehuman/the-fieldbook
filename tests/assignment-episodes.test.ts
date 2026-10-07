import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentDeadline,
  recalculateDeadlines,
  reviewDeadlines,
} from "../lib/assignment-episodes";
import { addDays, learningStage, learningTarget } from "../lib/learning";
import { reconcileLearning } from "../lib/learning-groups";
import { freshWorkspace } from "../lib/store";
import type { User } from "../lib/types";
import { assignedCourses } from "../lib/types";
const admin = "00000000-0000-4000-8000-000000000001",
  person = "00000000-0000-4000-8000-000000000002",
  login = "00000000-0000-4000-8000-000000000003",
  course = "00000000-0000-4000-8000-000000000004";
const hire = "2026-01-01";
const learner: User = {
  id: person,
  name: "Person",
  email: "person@example.test",
  role: "learner",
  active: true,
  groups: [],
  hireDate: hire,
  onboardingDays: 90,
};
test("90/7 deadlines use the later onboarding end or seven days from assignment, in UTC", () => {
  const dueDays = [
    [60, 90],
    [83, 90],
    [84, 91],
    [89, 96],
    [90, 97],
    [91, 98],
  ];
  for (const [day, due] of dueDays)
    assert.equal(
      assignmentDeadline(addDays(hire, day), learner, 7),
      addDays(hire, due),
    );
  assert.equal(
    learningStage(learner, undefined, addDays(hire, 90)),
    "New user",
  );
  assert.equal(
    learningStage(learner, undefined, addDays(hire, 91)),
    "Existing user",
  );
});
test("demo projects subtree assignments to readers and clears them after a team move", () => {
  const data = freshWorkspace(),
    c = data.content.find((c) => c.kind === "course")!;
  data.content = [c];
  data.publishedContent = [c];
  data.groups = [
    {
      id: "a",
      name: "A",
      teamIds: ["root"],
      teamLinkScope: "subtree",
      learningItems: [{ kind: "course", id: c.id }],
    },
  ];
  data.teams = [
    { id: "root", name: "Root" },
    { id: "child", name: "Child", parentId: "root" },
  ];
  data.users = [{ ...learner, teamId: "child" }];
  const next = reconcileLearning({ ...data, users: [] }, data, hire);
  assert.equal(next.users[0].learningAssignments!.length, 1);
  assert.equal(
    assignedCourses(next.publishedContent!, next.users[0], next.groups).length,
    1,
  );
  const moved = reconcileLearning(
    next,
    { ...next, users: next.users.map((u) => ({ ...u, teamId: undefined })) },
    addDays(hire, 1),
  );
  assert.equal(moved.users[0].learningAssignments!.length, 0);
  assert.equal(
    assignedCourses(moved.publishedContent!, moved.users[0], moved.groups)
      .length,
    0,
  );
});
test("demo preserves one continuous obligation across overlapping sources; removal/rejoin and new versions create new episodes", () => {
  const data = freshWorkspace();
  data.settings!.catchUpDays = 7;
  const c = data.content.find((c) => c.kind === "course")!;
  c.groups = ["a", "b"];
  c.assignments = [
    { groupId: "a", assignedAt: hire, due: { type: "none" } },
    { groupId: "b", assignedAt: hire, due: { type: "none" } },
  ];
  data.content = [c];
  data.publishedContent = [c];
  data.users = [{ ...learner, groups: ["a", "b"] }];
  data.groups = [
    { id: "a", name: "A", learningItems: [{ kind: "course", id: c.id }] },
    { id: "b", name: "B", learningItems: [{ kind: "course", id: c.id }] },
  ];
  let next = reconcileLearning(
    { ...data, users: [] },
    data,
    addDays(hire, 60) + "T00:00:00.000Z",
  );
  const first = next.users[0].learningAssignments![0];
  assert.equal(first.dueDate, addDays(hire, 90));
  next = reconcileLearning(
    next,
    {
      ...next,
      settings: { ...next.settings!, catchUpDays: 30, onboardingDays: 180 },
      users: next.users.map((u) => ({ ...u, groups: ["b"] })),
    },
    addDays(hire, 84) + "T00:00:00.000Z",
  );
  assert.equal(
    next.users[0].learningAssignments![0].episodeId,
    first.episodeId,
  );
  assert.equal(
    learningTarget(c, next.users[0], next.groups, next.settings),
    first.dueDate,
  );
  assert.equal(next.users[0].learningAssignments![0].sourceGroups.length, 1);
  const off = reconcileLearning(
    next,
    { ...next, users: next.users.map((u) => ({ ...u, groups: [] })) },
    addDays(hire, 85) + "T00:00:00.000Z",
  );
  assert.equal(off.users[0].learningAssignments!.length, 0);
  const joined = reconcileLearning(
    off,
    { ...off, users: off.users.map((u) => ({ ...u, groups: ["b"] })) },
    addDays(hire, 91) + "T00:00:00.000Z",
  );
  assert.notEqual(
    joined.users[0].learningAssignments![0].episodeId,
    first.episodeId,
  );
  assert.equal(
    joined.users[0].learningAssignments![0].dueDate,
    addDays(hire, 121),
  );
  const changed = { ...c, version: 2 };
  const version = reconcileLearning(
    joined,
    { ...joined, content: [changed], publishedContent: [changed] },
    addDays(hire, 92) + "T00:00:00.000Z",
  );
  assert.equal(version.users[0].learningAssignments![0].version, 2);
  const disabled = { ...joined.settings!, dueDatesEnabled: false };
  assert.equal(
    learningTarget(c, joined.users[0], joined.groups, disabled),
    undefined,
  );
  const review = reviewDeadlines(next);
  assert.ok(review.clocks.length);
  assert.ok(review.courses.length);
  assert.throws(
    () => recalculateDeadlines({ ...next, revision: 22 }, review.token),
    /changed/,
  );
  const recalculated = recalculateDeadlines(next, review.token);
  assert.equal(recalculated.users[0].onboardingDays, 180);
  assert.equal(
    recalculated.users[0].learningAssignments![0].assignedAt,
    first.assignedAt,
  );
});
