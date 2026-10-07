import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseCard } from "../components/CourseCard";
import { assignmentDeadline } from "../lib/assignment-episodes";
import { courseProgress } from "../lib/course-progress";
import { withPublishedSnapshots } from "../lib/demo-publication";
import {
  DEMO_LEARNING_DAY,
  refreshDemoLearningTimeline,
} from "../lib/demo-fixtures/learning-timeline";
import { addDays, learningState, learningTarget } from "../lib/learning";
import { reconcileLearning } from "../lib/learning-groups";
import { localProgressDetail } from "../lib/progress-report";
import {
  freshWorkspace,
  loadWorkspace,
  saveWorkspace,
  type Workspace,
} from "../lib/store";

function sample(day: string) {
  const data = withPublishedSnapshots(freshWorkspace(day));
  return reconcileLearning(data, data, `${day}T12:00:00.000Z`);
}
function admin(data: Workspace) {
  return data.users.find((person) => person.id === "demo-admin")!;
}
function card(data: Workspace, id: string) {
  const user = admin(data);
  const course = data.publishedContent!.find((item) => item.id === id)!;
  const progress = data.progress[user.id];
  const state = learningState(
    data.publishedContent!,
    user,
    data.groups,
    progress,
    data.settings,
  );
  return renderToStaticMarkup(
    createElement(CourseCard, {
      course,
      status: courseProgress(course, progress),
      dueDate: learningTarget(course, user, data.groups, data.settings),
      assignmentLabel: "Assigned",
      pastDue: state.overdue.some((item) => item.id === id),
      settings: data.settings,
    }),
  );
}
function storage(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  });
  return values;
}

test("fresh and reset samples keep real upcoming/overdue card and report states years later", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-10-07T12:00:00Z"),
  });
  for (const day of ["2026-10-07", "2027-04-07", "2028-02-29", "2032-09-30"]) {
    t.mock.timers.setTime(Date.parse(`${day}T12:00:00Z`));
    const data = sample(day);
    assert.equal(freshWorkspace().demoLearningDay, day);
    const future = card(data, "course-7");
    assert.match(future, /Due in 5 days/);
    assert.doesNotMatch(future, />Past due</);
    const past = card(data, "course-6");
    assert.match(past, />Past due</);
    assert.match(past, /Due 28 days ago/);
    const detail = localProgressDetail(data, admin(data));
    assert.equal(
      detail.courses.find((course) => course.id === "course-7")!.dueDate,
      addDays(day, 5),
    );
    assert.equal(
      detail.courses.filter(
        (course) => !course.complete && course.dueDate! < day,
      ).length,
      3,
    );
    // All sample deadlines still satisfy the actual onboarding/catch-up rule.
    for (const person of data.users)
      for (const assignment of person.learningAssignments || []) {
        assert.equal(
          assignment.dueDate,
          assignmentDeadline(
            assignment.assignedAt,
            person,
            assignment.catchUpDays,
          ),
        );
      }
  }
});

test("an existing browser refreshes and persists dates six months later without a reset", (t) => {
  const values = storage(t);
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-10-07T12:00:00Z"),
  });
  const before = loadWorkspace();
  t.mock.timers.setTime(Date.parse("2027-04-07T12:00:00Z"));
  const after = loadWorkspace();
  assert.match(card(after, "course-7"), /Due in 5 days/);
  assert.match(card(after, "course-6"), /Due 28 days ago/);
  assert.deepEqual(after.progress, before.progress);
  assert.equal(
    JSON.parse(values.get("fieldbook.workspace.v1")!).demoLearningDay,
    "2027-04-07",
  );
  assert.deepEqual(loadWorkspace(), after);
});

test("original fixed-date browsers upgrade automatically while older unrelated fixtures stay intact", (t) => {
  storage(t);
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2027-04-07T12:00:00Z"),
  });
  const legacy = sample(DEMO_LEARNING_DAY);
  delete legacy.demoLearningDay;
  // Simulate the older browser that predates the contributor profile.
  legacy.users = legacy.users.filter(
    (person) => person.id !== "demo-contributor",
  );
  saveWorkspace(legacy);
  const upgraded = loadWorkspace();
  assert.match(card(upgraded, "course-7"), /Due in 5 days/);
  assert.match(card(upgraded, "course-6"), /Due 28 days ago/);
  assert.equal(
    upgraded.users.find((person) => person.id === "demo-contributor")!
      .learningAssignments![0].dueDate,
    "2027-04-29",
  );
  const unrelated = sample(DEMO_LEARNING_DAY);
  unrelated.users = [{ ...admin(unrelated), id: "visitor-created-person" }];
  assert.deepEqual(
    refreshDemoLearningTimeline(unrelated, "2027-04-07").users,
    unrelated.users,
  );
});

test("refresh preserves visitor names, content, completion and actual quiz attempts", () => {
  const data = sample("2026-10-07");
  admin(data).name = "My sample admin";
  const course = data.content.find((item) => item.id === "course-7")!;
  course.summary = "An edited summary";
  data.progress["demo-admin"] = data.progress["demo-admin"].filter(
    (record) => record.content_id !== course.id,
  );
  data.progress["demo-admin"].push({
    content_id: course.id,
    version: course.version,
    lessons: course.lessons.map((lesson) => lesson.id),
    passed: true,
    attempts: [
      { at: "2026-10-07T13:00:00.000Z", passed: true, version: course.version },
    ],
  });
  const before = structuredClone(data);
  const after = refreshDemoLearningTimeline(data, "2027-04-07");
  assert.equal(admin(after).name, "My sample admin");
  assert.deepEqual(after.progress, before.progress);
  assert.deepEqual(after.content, before.content);
  assert.deepEqual(after.publishedContent, before.publishedContent);
  assert.doesNotMatch(card(after, course.id), /Due in|>Past due</);
  assert.deepEqual(data, before);
});

test("edited deadlines and new assignment episodes retain their dates on repeated visits", () => {
  const data = sample("2026-10-07");
  const assignments = admin(data).learningAssignments!;
  assignments.find((item) => item.contentId === "course-7")!.dueDate =
    "2026-12-01";
  const custom = assignments.find((item) => item.contentId === "course-6")!;
  custom.episodeId = "visitor-reassigned-course";
  const before = structuredClone(assignments);
  const after = refreshDemoLearningTimeline(
    refreshDemoLearningTimeline(data, "2027-04-07"),
    "2027-10-07",
  );
  for (const id of ["course-7", "course-6"])
    assert.deepEqual(
      admin(after).learningAssignments!.find((item) => item.contentId === id),
      before.find((item) => item.contentId === id),
    );
  assert.equal(
    admin(after).learningAssignments!.find(
      (item) => item.contentId === "course-9",
    )!.dueDate,
    "2027-09-09",
  );
});

test("edited hire dates, membership clocks and organization windows are never shifted", () => {
  const cases = [
    (data: Workspace) => {
      admin(data).hireDate = "2025-01-01";
    },
    (data: Workspace) => {
      admin(data).groupJoinedAt!["manager-essentials"] =
        "2026-10-07T12:00:00.000Z";
    },
    (data: Workspace) => {
      admin(data).teamId = "sales-team";
    },
    (data: Workspace) => {
      data.settings!.catchUpDays = 7;
    },
    (data: Workspace) => {
      data.settings!.onboardingDays = 60;
    },
  ];
  for (const edit of cases) {
    const data = sample("2026-10-07");
    edit(data);
    const before = structuredClone(admin(data));
    const after = refreshDemoLearningTimeline(data, "2027-04-07");
    assert.deepEqual(admin(after), before);
    assert.deepEqual(
      refreshDemoLearningTimeline(after, "2027-10-07").users.find(
        (person) => person.id === before.id,
      ),
      before,
    );
  }
});
