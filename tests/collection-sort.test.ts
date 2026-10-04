import test from "node:test";
import assert from "node:assert/strict";
import {
  compareOptionalDates,
  compareOptionalNumbers,
} from "../lib/collection-sort";
import {
  compareLearningRecords,
  learningSortOptions,
} from "../lib/learning-sort";
import { filterProgressAssignments } from "../lib/progress-report";

const records = [
  {
    id: "new",
    title: "Alpha",
    assignedAt: "2026-10-02",
    dueDate: "2026-10-20",
  },
  { id: "old", title: "Zulu", assignedAt: "2026-09-01", dueDate: "2026-10-05" },
  { id: "optional", title: "Independent learning" },
];
const order = (sort: string) =>
  [...records]
    .sort((a, b) => compareLearningRecords(a, b, sort))
    .map((record) => record.id);

test("personal assignment and deadline directions retain independent learning last", () => {
  assert.deepEqual(order("assigned-newest"), ["new", "old", "optional"]);
  assert.deepEqual(order("assigned-oldest"), ["old", "new", "optional"]);
  assert.deepEqual(order("due-earliest"), ["old", "new", "optional"]);
  assert.deepEqual(order("due-latest"), ["new", "old", "optional"]);
  assert.deepEqual(order("title-desc"), ["old", "optional", "new"]);
});

test("unknown and invalid dates and unmeasured percentages remain last in both directions", () => {
  for (const descending of [false, true]) {
    assert.equal(compareOptionalDates(undefined, "2026-10-01", descending), 1);
    assert.equal(compareOptionalDates("invalid", "2026-10-01", descending), 1);
    assert.equal(compareOptionalNumbers(null, 0, descending), 1);
    assert.equal(compareOptionalNumbers(100, undefined, descending), -1);
  }
});

test("view options expose useful personal dates without claiming guest or curriculum dates", () => {
  const options = (
    view: Parameters<typeof learningSortOptions>[0],
    guest = false,
    deadlines = true,
  ) =>
    learningSortOptions(view, guest, deadlines).map((option) => option.value);
  assert.deepEqual(options("curricula"), ["title", "title-desc"]);
  assert.deepEqual(options("completed"), ["title", "title-desc"]);
  assert.deepEqual(options("assigned", true), ["title", "title-desc"]);
  assert.deepEqual(options("assigned", false, false), ["title", "title-desc"]);
  assert.ok(options("yours", false, false).includes("assigned-oldest"));
  assert.ok(options("in-progress").includes("due-latest"));
  assert.ok(!options("in-progress", false, false).includes("due-latest"));
});

test("person report Due directions use unfinished deadlines, keeping completed and unknown rows last", () => {
  const detail = {
    personId: "synthetic",
    courses: [
      ...records.map((record) => ({
        ...record,
        category: "Test",
        version: 1,
        complete: false,
        sources: [],
      })),
      {
        id: "done",
        title: "Completed",
        category: "Test",
        version: 1,
        complete: true,
        dueDate: "2026-01-01",
        sources: [],
      },
    ],
  };
  const rows = (sort: string) =>
    filterProgressAssignments(detail, {
      sort,
      query: "",
      status: "all",
    }).courses.map((course) => course.id);
  assert.deepEqual(rows("due-earliest"), ["old", "new", "done", "optional"]);
  assert.deepEqual(rows("due-latest"), ["new", "old", "done", "optional"]);
});
