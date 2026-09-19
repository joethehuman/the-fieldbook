import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace, updateProgress } from "../lib/store";
import { assignedCourses, isComplete } from "../lib/types";
test("assignments follow role groups and exclude drafts", () => {
  const d = freshWorkspace();
  assert.equal(assignedCourses(d.content, d.users[0]).length, 3);
  assert.equal(assignedCourses(d.content, d.users[1]).length, 2);
  d.content.find((c) => c.id === "course-2")!.status = "draft";
  assert.equal(assignedCourses(d.content, d.users[0]).length, 2);
});
test("completion requires all lessons and a passing quiz", () => {
  let d = freshWorkspace();
  const c = d.content.find((c) => c.id === "course-2")!;
  const u = d.users[0].id;
  d = updateProgress(d, u, c, undefined, [0, 1]);
  assert.equal(isComplete(c, d.progress[u] || []), false);
  for (const l of c.lessons) d = updateProgress(d, u, c, l.id);
  d = updateProgress(d, u, c, undefined, [2, 2]);
  assert.equal(isComplete(c, d.progress[u]), false);
  d = updateProgress(d, u, c, undefined, [0, 1]);
  assert.equal(isComplete(c, d.progress[u]), true);
  d = updateProgress(d, u, c, undefined, [2, 2]);
  assert.equal(isComplete(c, d.progress[u]), true);
});
test("course version changes require new completion", () => {
  const d = freshWorkspace();
  const c = d.content.find((c) => c.id === "course-1")!;
  assert.equal(isComplete(c, d.progress[d.users[0].id]), true);
  assert.equal(
    isComplete({ ...c, version: 2 }, d.progress[d.users[0].id]),
    false,
  );
});
test("progress is isolated by user and ignores unknown lessons", () => {
  let d = freshWorkspace();
  const c = d.content.find((c) => c.id === "course-2")!;
  d = updateProgress(d, d.users[0].id, c, "invalid");
  assert.deepEqual(
    d.progress[d.users[0].id].find((p) => p.content_id === c.id)!.lessons,
    [],
  );
  d = updateProgress(d, d.users[0].id, c, c.lessons[0].id);
  assert.equal(d.progress[d.users[1].id], undefined);
});
