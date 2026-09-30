import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import { requiredSequence } from "../lib/learning";
import {
  assignedLearningCards,
  curriculumCourses,
  curriculumProgress,
} from "../lib/learning-cards";

function fixture() {
  const data = freshWorkspace();
  const user = data.users.find((u) => u.id === "demo-learner")!;
  // Isolate the three-course curriculum; standalone coverage is added explicitly below.
  const sequence = requiredSequence(data.content, user, data.groups).filter(
    (course) => data.curricula![0].courseIds.includes(course.id),
  );
  return { data, user, sequence };
}
test("assigned curricula replace their courses while standalone assignments remain ordered", () => {
  const { data, user, sequence } = fixture();
  const standalone = { ...sequence[0], id: "standalone" };
  const cards = assignedLearningCards(
    [...sequence, standalone],
    data.curricula!,
    user,
    data.groups,
  );
  assert.deepEqual(
    cards.map((c) => c.kind),
    ["curriculum", "course"],
  );
  assert.equal(cards[0].kind === "curriculum" && cards[0].courses.length, 3);
  assert.equal(cards[1].kind === "course" && cards[1].course.id, "standalone");
});
test("unassigned and draft curricula cannot hide assigned courses", () => {
  const { data, user, sequence } = fixture();
  const draft = data.curricula!.map((c) => ({
    ...c,
    status: "draft" as const,
  }));
  assert.equal(
    assignedLearningCards(sequence, draft, user, data.groups).length,
    3,
  );
  assert.equal(
    assignedLearningCards(
      sequence,
      data.curricula!,
      { ...user, groups: [] },
      data.groups,
    ).length,
    3,
  );
});
test("inherited and overlapping curriculum assignments show once per curriculum without duplicate course cards", () => {
  const { data, user, sequence } = fixture();
  const parent = data.groups[0];
  const child = { ...parent, id: "child", parentId: parent.id };
  const overlap = {
    ...data.curricula![0],
    id: "overlap",
    courseIds: [sequence[1].id],
  };
  child.learningItems = [
    ...child.learningItems!,
    { kind: "curriculum", id: overlap.id },
  ];
  const cards = assignedLearningCards(
    sequence,
    [...data.curricula!, overlap],
    { ...user, groups: ["child"] },
    [parent, child],
  );
  assert.equal(cards.length, 2);
  assert.ok(cards.every((c) => c.kind === "curriculum"));
  assert.equal(sequence.length, 3);
});
test("curriculum page preserves order, ignores unavailable courses, and uses current completion", () => {
  const { data, sequence } = fixture();
  const curriculum = {
    ...data.curricula![0],
    courseIds: [sequence[2].id, "missing", sequence[0].id, sequence[2].id],
  };
  const items = curriculumCourses(curriculum, sequence);
  assert.deepEqual(
    items.map((c) => c.id),
    [sequence[2].id, sequence[0].id],
  );
  const progress = items.map((c) => ({
    content_id: c.id,
    version: c.version,
    lessons: c.lessons.map((l) => l.id),
    passed: true,
  }));
  assert.equal(curriculumProgress(items, progress).complete, true);
  assert.equal(
    curriculumProgress(
      items.map((c, i) => (i === 0 ? { ...c, version: c.version + 1 } : c)),
      progress,
    ).percent,
    50,
  );
  assert.equal(curriculumProgress([], []).complete, false);
});
