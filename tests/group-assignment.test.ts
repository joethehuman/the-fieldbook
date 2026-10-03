import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace, type Workspace } from "../lib/store";
import {
  assignLearningToGroups,
  curriculumSources,
  directlyAssignedGroups,
} from "../lib/group-assignment";
import { reconcileLearning } from "../lib/learning-groups";
import { organizationChangeSummary } from "../lib/organization-change";

function fixture(): Workspace {
  const d = freshWorkspace();
  const course = {
    ...d.content.find((c) => c.kind === "course")!,
    id: "foundation",
    status: "published" as const,
    groups: ["first", "second"],
    assignments: [],
  };
  d.content = [course];
  d.publishedContent = undefined;
  d.curricula = [
    {
      id: "playlist",
      name: "Foundation",
      status: "published",
      description: "",
      courseIds: [course.id],
    },
  ];
  d.groups = [
    {
      id: "first",
      name: "First",
      learningItems: [
        { kind: "curriculum", id: "playlist" },
        { kind: "course", id: course.id },
      ],
    },
    {
      id: "second",
      name: "Second",
      learningItems: [{ kind: "course", id: course.id }],
    },
    { id: "third", name: "Third", learningItems: [] },
  ];
  d.users = [
    {
      ...d.users[0],
      groups: ["first", "second", "third"],
      groupJoinedAt: {},
      effectiveGroupJoinedAt: {},
      learningAssignments: [],
    },
  ];
  d.progress = {};
  return reconcileLearning(d, d, "2026-01-01T00:00:00.000Z");
}
test("course-first edits preserve continuing order and curriculum sources", () => {
  const d = fixture(),
    item = { kind: "course" as const, id: "foundation" };
  assert.deepEqual(directlyAssignedGroups(d, item), ["first", "second"]);
  const unchanged = assignLearningToGroups(d, item, ["second", "first"]);
  assert.equal(unchanged.groups[0], d.groups[0]);
  const removed = assignLearningToGroups(d, item, []);
  assert.deepEqual(removed.groups[0].learningItems, [
    { kind: "curriculum", id: "playlist" },
  ]);
  assert.deepEqual(curriculumSources(removed, "first", item), ["Foundation"]);
  assert.equal(organizationChangeSummary(d, removed).assignments.length, 0);
  const reconciled = reconcileLearning(d, removed, "2026-02-01T00:00:00.000Z");
  assert.equal(
    reconciled.users[0].learningAssignments![0].episodeId,
    d.users[0].learningAssignments![0].episodeId,
  );
  assert.equal(
    reconciled.users[0].learningAssignments![0].dueDate,
    d.users[0].learningAssignments![0].dueDate,
  );
});
test("removing final sources previews one loss and retains saved history", () => {
  const d = fixture();
  const noDirect = assignLearningToGroups(
    d,
    { kind: "course", id: "foundation" },
    [],
  );
  const removed = assignLearningToGroups(
    noDirect,
    { kind: "curriculum", id: "playlist" },
    [],
  );
  assert.equal(organizationChangeSummary(d, removed).peopleLosing, 1);
  const after = reconcileLearning(d, removed, "2026-02-01T00:00:00.000Z");
  assert.deepEqual(after.progress, d.progress);
  assert.equal(after.users[0].learningAssignments!.length, 0);
});
test("new links append without changing other groups; unpublished or stale targets fail", () => {
  const d = fixture();
  const next = assignLearningToGroups(
    d,
    { kind: "curriculum", id: "playlist" },
    ["first", "third"],
  );
  assert.equal(next.groups[0], d.groups[0]);
  assert.equal(next.groups[1], d.groups[1]);
  assert.deepEqual(next.groups[2].learningItems, [
    { kind: "curriculum", id: "playlist" },
  ]);
  assert.throws(
    () => assignLearningToGroups(d, { kind: "course", id: "missing" }, []),
    /Publish/,
  );
  assert.throws(
    () =>
      assignLearningToGroups(d, { kind: "course", id: "foundation" }, [
        "missing",
      ]),
    /changed/,
  );
});

test("guest review follows pending learning plans before course metadata is reconciled", () => {
  const d = fixture();
  d.settings!.access = "public";
  d.settings!.guestGroupId = "third";
  const assigned = assignLearningToGroups(
    d,
    { kind: "curriculum", id: "playlist" },
    ["first", "third"],
  );
  assert.deepEqual(
    organizationChangeSummary(d, assigned).guest.gained.map((c) => c.id),
    ["foundation"],
  );
  assert.equal(organizationChangeSummary(d, assigned).peopleGaining, 0);
});
