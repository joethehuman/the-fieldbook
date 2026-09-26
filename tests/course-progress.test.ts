import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import { assignedCourses, isComplete, type Progress } from "../lib/types";
import { completionPercent, requiredSequence } from "../lib/learning";
import { courseProgress, learningCollection } from "../lib/course-progress";

const workspace = freshWorkspace();
const courses = workspace.content.filter((c) => c.kind === "course");
const course = courses[0];
const passed = (c = course): Progress => ({
  content_id: c.id,
  version: c.version,
  lessons: c.lessons.map((l) => l.id),
  passed: true,
});

test("current-version course activity excludes empty, stale and unknown lesson records", () => {
  const empty = { ...passed(), passed: false, lessons: [] };
  assert.equal(courseProgress(course, [empty]).started, false);
  assert.equal(
    courseProgress(course, [{ ...passed(), version: course.version - 1 }])
      .started,
    false,
  );
  assert.equal(
    courseProgress(course, [{ ...empty, lessons: ["missing"] }]).started,
    false,
  );
  assert.equal(
    courseProgress(course, [
      { ...empty, attempts: [{ at: "2026-09-20", passed: false }] },
    ]).inProgress,
    true,
  );
  assert.equal(
    courseProgress(course, [
      { ...empty, lessons: [course.lessons[0].id, course.lessons[0].id] },
    ]).percent,
    Math.round(100 / (course.lessons.length + 1)),
  );
});

test("lesson completion never fills the ring before passing the knowledge check", () => {
  const lessons = { ...passed(), passed: false };
  assert.equal(courseProgress(course, [lessons]).inProgress, true);
  assert.ok(courseProgress(course, [lessons]).percent < 100);
  assert.deepEqual(courseProgress(course, [passed()]), {
    complete: true,
    started: true,
    inProgress: false,
    percent: 100,
  });
});

test("optional learning belongs in progress and completed without lowering assigned completion", () => {
  const user = workspace.users[0];
  const assigned = assignedCourses(courses, user, workspace.groups);
  const optional = { ...course, id: "optional", groups: [], assignments: [] };
  const all = [...courses, optional];
  const progress = [
    ...assigned.map(passed),
    { ...passed(optional), passed: false },
  ];
  assert.equal(
    completionPercent(
      assigned.filter((c) => isComplete(c, progress)).length,
      assigned.length,
    ),
    100,
  );
  assert.deepEqual(
    learningCollection(all, assigned, progress, "in-progress").map((c) => c.id),
    [optional.id],
  );
  assert.deepEqual(
    learningCollection(all, assigned, progress, "yours").map((c) => c.id),
    [...assigned.map((c) => c.id), optional.id],
  );
  assert.equal(
    learningCollection(all, assigned, progress, "assigned").length,
    assigned.length,
  );
  assert.equal(
    learningCollection(all, assigned, progress, "assigned", true).length,
    0,
  );
  progress[progress.length - 1] = passed(optional);
  assert.ok(
    learningCollection(all, assigned, progress, "yours").some(
      (c) => c.id === optional.id,
    ),
  );
  assert.ok(
    learningCollection(all, assigned, progress, "completed").some(
      (c) => c.id === optional.id,
    ),
  );
  assert.equal(
    learningCollection(all, assigned, progress, "in-progress").length,
    0,
  );
});

test("collections exclude drafts and preserve assigned sequence after completed items are removed", () => {
  const user = workspace.users[0];
  const sequence = requiredSequence(courses, user, workspace.groups);
  const progress = [passed(sequence[0])];
  const remaining = learningCollection(
    sequence,
    sequence,
    progress,
    "assigned",
    true,
  );
  assert.deepEqual(
    remaining.map((c) => c.id),
    sequence.slice(1).map((c) => c.id),
  );
  assert.equal(
    learningCollection(
      [{ ...course, status: "draft" }],
      [course],
      [passed()],
      "completed",
    ).length,
    0,
  );
  assert.equal(learningCollection(courses, [], progress, "assigned").length, 0);
  assert.deepEqual(
    learningCollection(courses, [], progress, "yours").map((c) => c.id),
    [sequence[0].id],
  );
});
