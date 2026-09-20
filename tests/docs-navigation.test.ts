import test from "node:test";
import assert from "node:assert/strict";
import {
  orderedDocCategories,
  availableDocSections,
  newDocSection,
  reorderDocSections,
} from "../lib/docs-navigation";

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

test("admin retains empty sections while readers only see content", () => {
  const docs = [{ category: "Reference" }, { category: "Legacy" }];
  const sections = availableDocSections(docs, ["Empty", "Reference"]);
  assert.deepEqual(sections, ["Empty", "Reference", "Legacy"]);
  assert.deepEqual(availableDocSections([], sections), sections);
  assert.deepEqual(orderedDocCategories(docs, sections), [
    "Reference",
    "Legacy",
  ]);
  assert.deepEqual(orderedDocCategories([], sections), []);
});
test("section creation trims names and rejects blank, duplicate and oversized lists", () => {
  assert.equal(newDocSection("  Getting started  ", []), "Getting started");
  assert.throws(() => newDocSection("  ", []));
  assert.throws(() => newDocSection("reference", ["Reference"]));
  assert.throws(() => newDocSection("x".repeat(81), []));
  assert.throws(() =>
    newDocSection(
      "New",
      Array.from({ length: 500 }, (_, i) => String(i)),
    ),
  );
});
test("reorder moves sections without swapping intervening entries", () => {
  const sections = ["Empty", "Start", "Reference", "More"];
  assert.deepEqual(reorderDocSections(sections, 0, 3), [
    "Start",
    "Reference",
    "More",
    "Empty",
  ]);
  assert.deepEqual(reorderDocSections(sections, 3, 0), [
    "More",
    "Empty",
    "Start",
    "Reference",
  ]);
  assert.deepEqual(reorderDocSections(sections, 1, 2), [
    "Empty",
    "Reference",
    "Start",
    "More",
  ]);
  assert.deepEqual(reorderDocSections(sections, 0, -1), sections);
  assert.deepEqual(sections, ["Empty", "Start", "Reference", "More"]);
});
