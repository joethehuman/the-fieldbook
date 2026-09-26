import test from "node:test";
import assert from "node:assert/strict";
import { correctOptionIds, gradeQuiz, quizUnlocked, requiresPassing, validQuestion } from "../lib/course-quiz";
import { freshWorkspace, updateProgress } from "../lib/store";
import { isComplete } from "../lib/types";
import { videoSource } from "../lib/video";
import { safeReturnPath } from "../lib/return-path";

test("one builder grades single and multiple answers as exact sets with stable IDs", () => {
  const base = freshWorkspace().content.find((item) => item.id === "course-2")!;
  const course = { ...base, questions: [{
    id: "q", prompt: "Choose both", options: ["A", "B", "C"],
    optionIds: ["a", "b", "c"], correctOptionIds: ["a", "c"],
  }] };
  assert.equal(validQuestion(course.questions[0]), true);
  assert.deepEqual(correctOptionIds(course.questions[0]), ["a", "c"]);
  assert.deepEqual(gradeQuiz(course, [[2, 0]]), { passed: true, answers: [{ questionId: "q", optionIds: ["c", "a"], correct: true }] });
  assert.equal(gradeQuiz(course, [[0]]).passed, false);
  assert.throws(() => gradeQuiz(course, [[0, 0]]), /Choose an answer/);
  assert.equal(validQuestion({ ...course.questions[0], correctOptionIds: ["a", "b", "c"] }), false);
  assert.equal(validQuestion({ ...course.questions[0], options: ["A"] }), false);
});

test("optional quiz records incorrect answers then waits for Complete course", () => {
  let workspace = freshWorkspace();
  const course = { ...workspace.content.find((item) => item.id === "course-2")!, requirePassing: false };
  const userId = workspace.users[0].id;
  for (const lesson of course.lessons) workspace = updateProgress(workspace, userId, course, lesson.id);
  workspace = updateProgress(workspace, userId, course, undefined, [[2], [2]]);
  const progress = workspace.progress[userId].find((entry) => entry.content_id === course.id)!;
  assert.equal(progress.attempts?.[0].passed, false);
  assert.equal(progress.attempts?.[0].answers?.[0].questionId, course.questions[0].id);
  assert.equal(quizUnlocked(course, progress.attempts), true);
  assert.equal(isComplete(course, workspace.progress[userId]), false);
  workspace = updateProgress(workspace, userId, course, undefined, undefined, true);
  assert.equal(isComplete(course, workspace.progress[userId]), true);
});

test("existing quizzes retain passing requirement and no-quiz lessons still need final action", () => {
  let workspace = freshWorkspace();
  const old = workspace.content.find((item) => item.id === "course-2")!;
  const userId = workspace.users[0].id;
  assert.equal(requiresPassing(old), true);
  for (const lesson of old.lessons) workspace = updateProgress(workspace, userId, old, lesson.id);
  workspace = updateProgress(workspace, userId, old, undefined, [[2], [2]]);
  assert.throws(() => updateProgress(workspace, userId, old, undefined, undefined, true), /Finish the lessons and quiz/);
  const noQuiz = { ...old, id: "no-quiz", questions: [] };
  for (const lesson of noQuiz.lessons) workspace = updateProgress(workspace, userId, noQuiz, lesson.id);
  assert.equal(isComplete(noQuiz, workspace.progress[userId]), false);
  workspace = updateProgress(workspace, userId, noQuiz, undefined, undefined, true);
  assert.equal(isComplete(noQuiz, workspace.progress[userId]), true);
});

test("Loom embeds and return destinations are bounded", () => {
  assert.deepEqual(videoSource("https://www.loom.com/share/0123456789abcdef0123456789abcdef"), { type: "embed", url: "https://www.loom.com/embed/0123456789abcdef0123456789abcdef" });
  assert.equal(safeReturnPath("/courses?view=yours"), "/courses?view=yours");
  assert.equal(safeReturnPath("//outside.example"), "/courses");
  assert.equal(safeReturnPath("/auth/logout"), "/courses");
});
