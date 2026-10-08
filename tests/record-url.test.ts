import test from "node:test";
import assert from "node:assert/strict";
import {
  decodedRecordId,
  recordId,
  recordSegment,
  titleSlug,
} from "../lib/record-url";
import { contentPath } from "../lib/navigation";
import { adminHref, parseAdminDestination } from "../lib/admin-destination";
import { teamHref, teamPersonId } from "../lib/team-destination";
import { destination } from "../lib/search";

const id = "3f1e6bd7-471a-8082-a31e-fb14ad0a9ca9";
test("reader URLs use the full identity even after renames and punctuation collisions", () => {
  const segment = recordSegment(id, "Test page");
  assert.equal(segment, "test-page-3f1e6bd7471a8082a31efb14ad0a9ca9");
  for (const value of [
    id,
    segment,
    recordSegment(id, "Renamed page"),
    `old-title-${id}`,
    id.replaceAll("-", ""),
  ])
    assert.equal(recordId(value), id);
  assert.equal(titleSlug("Setup & Access"), titleSlug("Setup Access"));
  assert.notEqual(
    contentPath("doc", id, "Setup & Access"),
    contentPath("doc", "00000000-0000-4000-8000-000000000001", "Setup Access"),
  );
  assert.equal(titleSlug(" Café — 安全  "), "cafe-安全");
  assert.equal(titleSlug(" 🙃 "), "untitled");
  assert.ok(titleSlug("A ".repeat(300)).length <= 80);
  assert.equal(decodedRecordId(recordSegment(id, "安全")), id);
  assert.equal(decodedRecordId(recordSegment(id, "𐐀".repeat(81))), id);
  for (const value of ["", "a/b", "a\\b", "a\u0000b", "a".repeat(501)])
    assert.equal(recordId(value), undefined);
  assert.equal(decodedRecordId("%"), undefined);
});
test("synthetic identifiers and exact legacy IDs remain reversible", () => {
  const compound = `legacy-${id}`;
  const records = [{ id: "course-1" }, { id: "course--1" }, { id: compound }];
  assert.equal(
    decodedRecordId(recordSegment(compound, "Legacy name"), records),
    compound,
  );
  assert.equal(
    decodedRecordId(recordSegment("course-1", "New course"), records),
    "course-1",
  );
  assert.equal(recordId("course--1", records), "course--1");
  assert.equal(recordId("unknown--missing", records), undefined);
});
test("Admin type tabs, return tabs and named records round-trip", () => {
  for (const kind of ["doc", "brief", "course"] as const) {
    const list = { tab: "content" as const, contentKind: kind };
    assert.deepEqual(parseAdminDestination(adminHref(list)), list);
    const editor = { ...list, id, view: "edit" as const };
    assert.deepEqual(
      parseAdminDestination(adminHref(editor, "Test page")),
      editor,
    );
  }
  for (const deletedKind of ["content", "user"] as const) {
    const value = { tab: "deleted" as const, deletedKind };
    assert.deepEqual(parseAdminDestination(adminHref(value)), value);
  }
  assert.deepEqual(
    parseAdminDestination(adminHref({ tab: "people", id }, "Example Person")),
    { tab: "people", id },
  );
  assert.equal(teamPersonId(teamHref(id, "Example Person")), id);
  assert.equal(
    destination({
      contentId: id,
      kind: "course",
      title: "Test page",
      lessonId: "one/two",
    }),
    `/courses/${recordSegment(id, "Test page")}?lesson=one%2Ftwo`,
  );
});
