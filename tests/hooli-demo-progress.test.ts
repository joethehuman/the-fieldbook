import test from "node:test";
import assert from "node:assert/strict";
import { withPublishedSnapshots } from "../lib/demo-publication";
import { reconcileLearning, expandLearning } from "../lib/learning-groups";
import { loadWorkspace, saveWorkspace } from "../lib/store";
import { legacyWorkspace as freshWorkspace } from "./fixtures/legacy-workspace";
import { assignedCourses, isComplete } from "../lib/types";

test("Hooli security course stays assigned when progress is saved", () => {
  const before = withPublishedSnapshots(freshWorkspace());
  const group = before.groups.find((item) => item.id === "sales")!;
  assert.deepEqual(
    group.requiredCourseIds,
    expandLearning(group.learningItems!, before.curricula!),
  );
  const after = structuredClone(before);
  const security = after.publishedContent!.find(
    (item) => item.id === "course-10",
  )!;
  after.progress["demo-admin"] = [
    {
      content_id: security.id,
      version: security.version,
      lessons: security.lessons.map((lesson) => lesson.id),
      passed: true,
    },
  ];
  const saved = reconcileLearning(before, after);
  const admin = saved.users.find((user) => user.id === "demo-admin")!;
  const assigned = assignedCourses(
    saved.publishedContent!,
    admin,
    saved.groups,
  );
  assert.equal(assigned.length, 4);
  assert.equal(
    assigned.filter((course) => isComplete(course, saved.progress[admin.id]))
      .length,
    1,
  );
});

test("loading a saved Hooli demo restores the dropped assignment without losing completion", () => {
  const oldStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
  });
  try {
    const before = withPublishedSnapshots(freshWorkspace());
    const group = before.groups.find((item) => item.id === "sales")!;
    group.learningItems = [{ kind: "curriculum", id: "sales-foundations" }];
    group.requiredCourseIds = [
      "course-4",
      "course-10",
      "course-11",
      "course-12",
    ];
    saveWorkspace(before);
    assert.deepEqual(
      loadWorkspace().groups.find((item) => item.id === "sales")
        ?.requiredCourseIds,
      ["course-4", "course-11", "course-12", "course-10"],
    );
    const after = structuredClone(before);
    const security = after.publishedContent!.find(
      (item) => item.id === "course-10",
    )!;
    const completion = {
      content_id: security.id,
      version: security.version,
      lessons: security.lessons.map((lesson) => lesson.id),
      passed: true,
    };
    after.progress["demo-admin"] = [completion];
    saveWorkspace(reconcileLearning(before, after));

    const repaired = loadWorkspace();
    const admin = repaired.users.find((user) => user.id === "demo-admin")!;
    const assigned = assignedCourses(
      repaired.publishedContent!,
      admin,
      repaired.groups,
    );
    assert.equal(assigned.length, 4);
    assert.equal(
      assigned.filter((course) =>
        isComplete(course, repaired.progress[admin.id]),
      ).length,
      1,
    );
    assert.deepEqual(repaired.progress[admin.id], [completion]);
    assert.deepEqual(
      repaired.groups.find((item) => item.id === "sales")?.learningItems,
      [
        { kind: "curriculum", id: "sales-foundations" },
        { kind: "course", id: "course-10" },
      ],
    );
    assert.deepEqual(loadWorkspace(), repaired);
  } finally {
    if (oldStorage)
      Object.defineProperty(globalThis, "localStorage", oldStorage);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});
