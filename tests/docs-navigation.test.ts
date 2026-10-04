import test from "node:test";
import assert from "node:assert/strict";
import {
  availableDocSections,
  createDocSection,
  deleteDocSection,
  docSections,
  legacySectionConflict,
  moveDocSection,
  moveDocumentsInNavigation,
  orderedDocs,
  orderedSectionDocs,
  renameDocSection,
  reorderDocSection,
  reorderDocInSection,
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

test("drag insertion order matches the preview across three or more siblings", () => {
  const sections = [
    { id: "a", name: "A" },
    { id: "a1", name: "A child", parentId: "a" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
    { id: "d", name: "D" },
  ];
  const moved = reorderDocSection(sections, "a", 3);
  assert.deepEqual(
    moved.filter((section) => !section.parentId).map((section) => section.id),
    ["b", "c", "d", "a"],
  );
  assert.equal(moved.find((section) => section.id === "a1")?.parentId, "a");
  assert.deepEqual(
    reorderDocSection(moved, "a", -3)
      .filter((section) => !section.parentId)
      .map((section) => section.id),
    ["a", "b", "c", "d"],
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
  const sections = availableDocSections(
    [placed],
    [],
    [{ id: "root", name: "Start", legacyCategory: "Start" }],
  );
  assert.equal(sectionForDoc(placed, sections)?.id, "missing");
  assert.equal(
    sectionPath(sectionForDoc(placed, sections)!, sections),
    "Start → Install",
  );
  assert.deepEqual(
    orderedDocs([placed], [], sections).map((item) => item.id),
    ["one"],
  );
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

test("document reordering saves navigation only and keeps publication, placement and other branches", () => {
  const sections = [
    { id: "a", name: "Start" },
    { id: "x", name: "Install", parentId: "a" },
    { id: "b", name: "Reference" },
  ];
  const docs = [
    { ...doc("first", "Start", "", "a"), sectionOrder: 2 },
    { ...doc("second", "Start", "", "a"), sectionOrder: 1 },
    doc("draft", "Start", "", "a", "draft"),
    doc("child", "Start", "Install", "x"),
    doc("other", "Reference", "", "b"),
  ];
  const before = structuredClone(docs);
  assert.deepEqual(
    orderedSectionDocs(docs, sections, "a").map((item) => item.id),
    ["draft", "second", "first"],
  );
  const moved = reorderDocInSection(sections, docs, "a", "first", 0);
  assert.deepEqual(moved[0].docOrder, ["first", "draft", "second"]);
  assert.deepEqual(
    orderedDocs(docs, [], moved).map((item) => item.id),
    ["first", "second", "child", "other"],
  );
  assert.deepEqual(docs, before);
  assert.strictEqual(moved[1], sections[1]);
  assert.strictEqual(moved[2], sections[2]);
  assert.strictEqual(reorderDocInSection(moved, docs, "a", "child", 0), moved);
  assert.strictEqual(reorderDocInSection(moved, docs, "a", "first", -1), moved);
  assert.strictEqual(reorderDocInSection(moved, docs, "a", "first", 8), moved);
});

test("saved order tolerates missing documents and appends new pages using existing order", () => {
  const sections = [
    { id: "a", name: "Start", docOrder: ["gone", "second", "first"] },
  ];
  const docs = [
    doc("first", "Start", "", "a"),
    doc("new", "Start", "", "a"),
    doc("second", "Start", "", "a"),
  ];
  assert.deepEqual(
    orderedDocs(docs, [], sections).map((item) => item.id),
    ["second", "first", "new"],
  );
  const moved = reorderDocInSection(sections, docs, "a", "new", 0);
  assert.deepEqual(moved[0].docOrder, ["new", "second", "first"]);
});

test("public document ordering excludes draft-only and unrelated document IDs", () => {
  const sections = [
    {
      id: "a",
      name: "Start",
      docOrder: ["draft", "other", "second", "first", "gone"],
    },
    { id: "b", name: "Reference" },
  ];
  const docs = [
    doc("first", "Start", "", "a"),
    doc("second", "Start", "", "a"),
    doc("draft", "Start", "", "a", "draft"),
    doc("other", "Reference", "", "b"),
  ];
  const visible = publicSettings(
    { ...defaultSettings, docSections: sections },
    docs,
  );
  assert.deepEqual(visible.docSections?.[0].docOrder, ["second", "first"]);
  assert.deepEqual(
    orderedDocs(docs, [], visible.docSections).map((item) => item.id),
    ["second", "first", "other"],
  );
  assert.throws(
    () =>
      validateDocSections([
        { id: "a", name: "Start", docOrder: ["first", "first"] },
      ]),
    /unique document IDs/,
  );
});


test("cross-section staging removes source order and inserts at a destination without editing snapshots", () => {
  const sections = [
    { id: "a", name: "A", docOrder: ["first", "second"] },
    { id: "b", name: "B", docOrder: ["third"] },
    { id: "child", name: "Child", parentId: "b" },
  ];
  const docs = [doc("first", "A", "", "a"), doc("second", "A", "", "a"), doc("third", "B", "", "b")];
  const original = structuredClone(docs);
  const next = moveDocumentsInNavigation(sections, docs, ["second"], "b", 0);
  assert.deepEqual(next.find((s) => s.id === "a")?.docOrder, ["first"]);
  assert.deepEqual(next.find((s) => s.id === "b")?.docOrder, ["second", "third"]);
  assert.deepEqual(docs, original);
  const nested = moveDocumentsInNavigation(sections, docs, ["first", "second"], "child");
  assert.deepEqual(nested.find((s) => s.id === "child")?.docOrder, ["first", "second"]);
  assert.throws(() => moveDocumentsInNavigation(sections, docs, ["first"], "missing"), /existing/);
  assert.throws(() => moveDocumentsInNavigation(sections, docs, ["missing"], "b"), /unavailable/);
});
