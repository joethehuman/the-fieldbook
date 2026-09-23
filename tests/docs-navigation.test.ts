import test from "node:test";
import assert from "node:assert/strict";
import {
  availableDocSections,
  createDocSection,
  deleteDocSection,
  docSections,
  legacySectionConflict,
  moveDocSection,
  orderedDocs,
  renameDocSection,
  reorderDocSection,
  sectionForDoc,
  sectionPath,
  validateDocSections,
  type DocLink,
} from "../lib/docs-navigation";
import { defaultSettings, publicSettings } from "../lib/settings";

const doc = (
  id: string,
  category: string,
  folder = "",
  sectionId?: string,
  status: DocLink["status"] = "published",
): DocLink => ({
  id,
  title: id,
  category,
  folder,
  sectionId,
  kind: "doc",
  status,
});

test("flat legacy sections, empty sections and assignments keep their saved order", () => {
  const docs = [doc("a", "General"), doc("b", "Start"), doc("c", "General")];
  const sections = availableDocSections(docs, ["Start", "Empty", "General"]);
  assert.deepEqual(
    sections.map((section) => section.name),
    ["Start", "Empty", "General"],
  );
  assert.equal(sectionForDoc(docs[0], sections)?.name, "General");
  assert.deepEqual(
    orderedDocs(docs, [], sections).map((item) => item.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    docSections(docs, [], sections).map((section) => section.name),
    ["Start", "General"],
  );
});

test("parent and subsection placement follows one depth-first order", () => {
  let sections = createDocSection([], "Getting started", undefined, "parent");
  sections = createDocSection(sections, "Installation", "parent", "child");
  const docs = [
    doc("child", "Getting started", "Installation", "child"),
    doc("parent", "Getting started", "", "parent"),
    doc("draft", "Getting started", "Installation", "child", "draft"),
  ];
  assert.equal(
    sectionPath(sections[1], sections),
    "Getting started → Installation",
  );
  assert.deepEqual(
    orderedDocs(docs, [], sections).map((item) => item.id),
    ["parent", "child"],
  );
  assert.deepEqual(
    docSections(docs, [], sections)[0].folders.map((child) => child.name),
    ["Installation"],
  );
});

test("rename, move, promotion and sibling reorder preserve IDs and document placement", () => {
  let sections = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "x", name: "Shared", parentId: "a" },
    { id: "y", name: "Other", parentId: "a" },
  ];
  const placed = doc("placed", "A", "Shared", "x");
  sections = renameDocSection(sections, "x", "Renamed");
  sections = moveDocSection(sections, "x", "b");
  assert.equal(sectionForDoc(placed, sections)?.id, "x");
  assert.equal(
    sectionPath(
      sections.find((section) => section.id === "x")!,
      sections,
    ),
    "B → Renamed",
  );
  sections = moveDocSection(sections, "x");
  assert.equal(
    sectionPath(
      sections.find((section) => section.id === "x")!,
      sections,
    ),
    "Renamed",
  );
  assert.equal(sectionForDoc(placed, sections)?.id, "x");
  sections = reorderDocSection(sections, "x", -1);
  assert.deepEqual(
    sections
      .filter((section) => !section.parentId)
      .map((section) => section.name),
    ["A", "Renamed", "B"],
  );
});

test("write validation rejects invalid depth, cycles, parents and sibling duplicates", () => {
  const sections = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "x", name: "Same", parentId: "a" },
    { id: "y", name: "Same", parentId: "b" },
  ];
  validateDocSections(sections);
  assert.throws(
    () => createDocSection(sections, "same", "a"),
    /different names/,
  );
  assert.throws(
    () => createDocSection(sections, "C", "missing"),
    /existing top-level/,
  );
  assert.throws(() => createDocSection(sections, "C", "x"), /two levels/);
  assert.throws(() => moveDocSection(sections, "a", "x"), /subsections/);
  assert.throws(() => moveDocSection(sections, "x", "x"), /cycles/);
  assert.throws(() => renameDocSection(sections, "a", "b"), /different names/);
  assert.throws(
    () => createDocSection(sections, "x".repeat(81)),
    /80 characters/,
  );
});

test("deletion guards children, draft and published documents", () => {
  const sections = [
    { id: "a", name: "A", legacyCategory: "Old A" },
    { id: "x", name: "X", parentId: "a" },
  ];
  assert.throws(() => deleteDocSection(sections, "a", []), /subsections/);
  assert.throws(
    () =>
      deleteDocSection(sections, "x", [doc("draft", "A", "", "x", "draft")]),
    /documents/,
  );
  assert.throws(
    () => deleteDocSection(sections, "a", [doc("legacy", "Old A")]),
    /subsections/,
  );
  assert.deepEqual(
    deleteDocSection(sections, "x", []).map((section) => section.id),
    ["a"],
  );
});

test("one legacy folder is a subsection; deeper legacy paths are reported", () => {
  const docs = [doc("one", "Start", "Install")];
  const sections = availableDocSections(docs);
  assert.equal(
    sectionPath(sectionForDoc(docs[0], sections)!, sections),
    "Start → Install",
  );
  assert.equal(legacySectionConflict(docs), null);
  assert.match(
    legacySectionConflict([doc("deep", "Start", "Install/Linux")])!,
    /deeper than two/,
  );
});

test("a document keeps its placement visible if a concurrent edit removes its section", () => {
  const placed = doc("one", "Start", "Install", "missing");
  const sections = availableDocSections([placed], [], [{ id: "root", name: "Start", legacyCategory: "Start" }]);
  assert.equal(sectionForDoc(placed, sections)?.id, "missing");
  assert.equal(sectionPath(sectionForDoc(placed, sections)!, sections), "Start → Install");
  assert.deepEqual(orderedDocs([placed], [], sections).map((item) => item.id), ["one"]);
});

test("public settings expose only sections needed by published Docs", () => {
  const sections = [
    { id: "a", name: "Start" },
    { id: "b", name: "Draft only" },
    { id: "x", name: "Install", parentId: "a" },
  ];
  const settings = {
    ...defaultSettings,
    docSections: sections,
    docCategoryOrder: ["Old empty"],
  };
  const visible = publicSettings(settings, [
    doc("published", "Start", "Install", "x"),
    doc("draft", "Draft only", "", "b", "draft"),
  ]);
  assert.deepEqual(
    visible.docSections?.map((section) => section.id),
    ["a", "x"],
  );
  assert.deepEqual(visible.docCategoryOrder, []);
});
