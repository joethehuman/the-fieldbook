import { test } from "node:test";
import assert from "node:assert/strict";
import { sortGroupBrowseItems } from "../lib/group-browse-sort";

const items = [
  {
    id: "a",
    name: "Alpha",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-20T00:00:00Z",
    assigned: false,
  },
  {
    id: "b",
    name: "Bravo",
    createdAt: "2026-09-10T00:00:00Z",
    updatedAt: "2026-09-15T00:00:00Z",
    assigned: true,
  },
  { id: "c", name: "Curriculum without dates", assigned: false },
];

test("group browse sorts by saved dates without changing the recommendation sequence", () => {
  const original = items.map((item) => item.id);
  assert.deepEqual(
    sortGroupBrowseItems(items, "updated-newest").map((item) => item.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    sortGroupBrowseItems(items, "updated-oldest").map((item) => item.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    sortGroupBrowseItems(items, "created-newest").map((item) => item.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    sortGroupBrowseItems(items, "assigned-first").map((item) => item.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    items.map((item) => item.id),
    original,
  );
});
