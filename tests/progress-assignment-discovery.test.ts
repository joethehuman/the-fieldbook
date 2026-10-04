import test from "node:test";
import assert from "node:assert/strict";
import {
  filterProgressAssignments,
  type ProgressDetail,
} from "../lib/progress-report";

const detail: ProgressDetail = {
  personId: "synthetic",
  asOf: "2026-10-03",
  deadlinesEnabled: true,
  courses: [
    {
      id: "old",
      title: "Account basics",
      assignedAt: "2026-09-01T10:00:00Z",
      dueDate: "2026-09-15",
      complete: false,
    },
    {
      id: "new",
      title: "Customer conversations",
      assignedAt: "2026-10-02T10:00:00Z",
      dueDate: "2026-10-20",
      complete: false,
    },
    {
      id: "done",
      title: "Customer introductions",
      assignedAt: "2026-09-20T10:00:00Z",
      dueDate: "2026-09-21",
      complete: true,
    },
    { id: "unknown", title: "Assignment without a date", complete: false },
  ].map((course) => ({
    ...course,
    category: "Learning",
    version: 1,
    sources: [],
  })),
};
const controls = { query: "", status: "all", sort: "newest" };
const ids = (overrides = {}) =>
  filterProgressAssignments(detail, { ...controls, ...overrides }).courses.map(
    (course) => course.id,
  );

test("assignment discovery uses assigned dates, keeps unknown dates last and does not mutate the report", () => {
  assert.deepEqual(ids(), ["new", "done", "old", "unknown"]);
  assert.deepEqual(ids({ sort: "oldest" }), ["old", "done", "new", "unknown"]);
  assert.deepEqual(ids({ query: "  CUSTOMER  " }), ["new", "done"]);
  assert.deepEqual(
    detail.courses.map((course) => course.id),
    ["old", "new", "done", "unknown"],
  );
});

test("status filtering distinguishes unfinished, overdue and complete courses", () => {
  assert.deepEqual(ids({ status: "incomplete" }), ["new", "old", "unknown"]);
  assert.deepEqual(ids({ status: "overdue" }), ["old"]);
  assert.deepEqual(ids({ status: "complete", query: "Customer" }), ["done"]);
  assert.deepEqual(
    filterProgressAssignments(detail, { ...controls, status: "overdue" }, false)
      .courses,
    [],
  );
  assert.deepEqual(ids({ query: "no match" }), []);
});
