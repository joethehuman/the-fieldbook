import test from "node:test";
import assert from "node:assert/strict";
import { orderedDocCategories } from "../lib/docs-navigation";

test("saved Docs order survives content edits and appends new categories", () => {
  const docs = ["General", "Getting started", "Using Fieldbook", "General"].map(
    (category) => ({ category }),
  );
  const saved = ["Getting started", "Using Fieldbook"];
  assert.deepEqual(orderedDocCategories(docs, saved), [
    "Getting started",
    "Using Fieldbook",
    "General",
  ]);
  assert.deepEqual(
    orderedDocCategories([...docs].reverse(), saved),
    orderedDocCategories(docs, saved),
  );
  assert.deepEqual(
    orderedDocCategories([...docs, { category: "Another new section" }], saved),
    ["Getting started", "Using Fieldbook", "Another new section", "General"],
  );
});

test("navigation omits unavailable sections and is stable before an order is saved", () => {
  assert.deepEqual(
    orderedDocCategories(
      [{ category: "Visible" }],
      ["Private draft", "Visible", "Visible", "Deleted"],
    ),
    ["Visible"],
  );
  assert.deepEqual(
    orderedDocCategories([{ category: "Z" }, { category: "A" }]),
    ["A", "Z"],
  );
  assert.deepEqual(orderedDocCategories([], ["Deleted"]), []);
});
