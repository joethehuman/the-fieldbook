import test from "node:test";
import assert from "node:assert/strict";
import { applyDemoBulk } from "../lib/bulk-actions";
import { freshWorkspace } from "../lib/store";
import {
  assignLearningToAudiences,
  directlyAssignedAudiences,
  curriculumAudienceSources,
  sourceLabels,
  learningChangeImpact,
} from "../lib/assignment-audiences";
import { reconcileLearning } from "../lib/learning-groups";
import { assignedCourses } from "../lib/types";
import { requiredSequence, learningTarget } from "../lib/learning";
import { assignedLearningCards } from "../lib/learning-cards";

test("mixed audiences preserve a continuous episode, curriculum paths, ordering and completion", () => {
  const base = freshWorkspace();
  const courses = base.content.filter((c) => c.kind === "course").slice(0, 3);
  base.content = courses;
  base.publishedContent = structuredClone(courses);
  base.groups = [{ id: "same", name: "Sales", learningItems: [] }];
  base.teams = [
    { id: "same", name: "Sales", learningItems: [] },
    { id: "child", name: "West", parentId: "same" },
  ];
  base.users = [
    {
      ...base.users[0],
      groups: ["same"],
      teamId: "child",
      hireDate: undefined,
      onboardingStart: undefined,
    },
  ];
  base.curricula = [
    {
      id: "p",
      name: "Playlist",
      description: "",
      status: "published",
      courseIds: [courses[1].id, courses[0].id],
    },
  ];
  let data = reconcileLearning(
    base,
    assignLearningToAudiences(
      base,
      [{ kind: "curriculum", id: "p" }],
      ["team:same"],
      "add",
    ),
    "2026-10-01T00:00:00.000Z",
  );
  const first = data.users[0].learningAssignments!.find(
    (a) => a.contentId === courses[0].id,
  )!;
  assert.equal(
    assignedCourses(data.content, data.users[0], data.groups).length,
    2,
  );
  assert.deepEqual(
    requiredSequence(data.content, data.users[0], data.groups).map((c) => c.id),
    [courses[1].id, courses[0].id],
  );
  assert.equal(
    assignedLearningCards(
      requiredSequence(data.content, data.users[0], data.groups),
      data.curricula!,
      data.users[0],
      data.groups,
    )[0].kind,
    "curriculum",
  );
  assert.deepEqual(
    curriculumAudienceSources(data, "team:same", {
      kind: "course",
      id: courses[0].id,
    }),
    ["Playlist"],
  );
  let next = assignLearningToAudiences(
    data,
    [{ kind: "course", id: courses[0].id }],
    ["group:same", "team:same"],
  );
  data = reconcileLearning(data, next, "2026-10-05T00:00:00.000Z");
  assert.equal(
    data.users[0].learningAssignments!.find(
      (a) => a.contentId === courses[0].id,
    )!.episodeId,
    first.episodeId,
  );
  assert.deepEqual(
    directlyAssignedAudiences(data, {
      kind: "course",
      id: courses[0].id,
    }).sort(),
    ["group:same", "team:same"],
  );
  assert.deepEqual(sourceLabels(data, data.users[0], courses[0].id).sort(), [
    "Group: Sales",
    "Team: Sales",
  ]);
  assert.equal(
    learningTarget(data.content[0], data.users[0], data.groups, data.settings),
    first.dueDate,
  );
  next = assignLearningToAudiences(
    data,
    [{ kind: "course", id: courses[0].id }],
    [],
  );
  data = reconcileLearning(data, next, "2026-10-06T00:00:00.000Z");
  assert.equal(
    assignedCourses(data.content, data.users[0], data.groups).length,
    2,
    "playlist keeps coverage",
  );
  assert.equal(
    data.users[0].learningAssignments!.find(
      (a) => a.contentId === courses[0].id,
    )!.episodeId,
    first.episodeId,
  );
  const scoped = { ...data, teams: [] };
  assert.deepEqual(
    sourceLabels(
      { ...scoped, teams: [{ id: "child", name: "West" }] },
      data.users[0],
      courses[0].id,
    ),
    ["Team: Sales"],
  );
  assert.deepEqual(
    sourceLabels(scoped, data.users[0], courses[0].id),
    ["Team: Sales"],
    "authorized projection needs no reporting tree",
  );
  next = assignLearningToAudiences(
    data,
    [{ kind: "curriculum", id: "p" }],
    [],
    "set",
  );
  data = reconcileLearning(data, next, "2026-10-07T00:00:00.000Z");
  assert.equal(data.users[0].learningAssignments!.length, 0);
  next = assignLearningToAudiences(
    data,
    [{ kind: "course", id: courses[0].id }],
    ["team:same"],
  );
  data = reconcileLearning(data, next, "2026-10-08T00:00:00.000Z");
  assert.notEqual(
    data.users[0].learningAssignments![0].episodeId,
    first.episodeId,
  );
  assert.equal(
    data.users[0].learningAssignments![0].assignedAt,
    "2026-10-08T00:00:00.000Z",
  );
  assert.deepEqual(data.progress, base.progress);
});

test("audience mutations reject missing audiences and unpublished learning without changing input", () => {
  const data = freshWorkspace(),
    before = JSON.stringify(data);
  assert.throws(
    () =>
      assignLearningToAudiences(
        data,
        [{ kind: "course", id: "missing" }],
        ["team:sales-team"],
      ),
    /Publish/,
  );
  assert.throws(
    () => assignLearningToAudiences(data, [], ["team:missing"]),
    /audience changed/,
  );
  assert.equal(JSON.stringify(data), before);
});

test("demo bulk unpublish closes coverage and republication starts a new episode without reload", () => {
  let data = freshWorkspace();
  const course = data.content.find((c) => c.kind === "course")!;
  data = reconcileLearning(
    data,
    assignLearningToAudiences(
      data,
      [{ kind: "course", id: course.id }],
      ["team:sales-team"],
      "add",
    ),
    "2026-10-01T00:00:00.000Z",
  );
  const first = data.users[0].learningAssignments!.find(
    (a) => a.contentId === course.id,
  )!;
  const actor = data.users.find((u) => u.role === "admin")!;
  const old = data.content.find((c) => c.id === course.id)!;
  // Demo bulk operations use explicit revisions just like installed mutations.
  old.revision = 1;
  old.publishedRevision = 1;
  data = applyDemoBulk(
    data,
    actor,
    {
      entity: "content",
      operation: "unpublish",
      items: [{ id: course.id, expected: 1 }],
    },
    Date.parse("2026-10-02T00:00:00Z"),
  ).data;
  assert(
    !data.users[0].learningAssignments!.some((a) => a.contentId === course.id),
  );
  data = applyDemoBulk(
    data,
    actor,
    {
      entity: "content",
      operation: "publish",
      items: [{ id: course.id, expected: 2 }],
    },
    Date.parse("2026-10-03T00:00:00Z"),
  ).data;
  const next = data.users[0].learningAssignments!.find(
    (a) => a.contentId === course.id,
  )!;
  assert(next);
  assert.notEqual(next.episodeId, first.episodeId);
  assert.equal(next.assignedAt, "2026-10-03T00:00:00.000Z");
});

test("installed Organization fallback includes people without direct teams in assignment impact", () => {
  const data = freshWorkspace();
  const course = data.content.find((c) => c.kind === "course")!;
  data.groups = [];
  data.curricula = [];
  data.content = [course];
  data.publishedContent = structuredClone(data.content);
  data.users = [{ ...data.users[0], groups: [], teamId: undefined }];
  data.teams = [
    {
      id: "org",
      name: "Organization",
      system: "organization",
      learningItems: [],
    },
  ];
  const after = assignLearningToAudiences(
    data,
    [{ kind: "course", id: course.id }],
    ["team:org"],
  );
  assert.deepEqual(learningChangeImpact(data, after)[0].gained, [course.id]);
  const saved = reconcileLearning(data, after);
  assert.equal(
    saved.users[0].learningAssignments?.[0].sourceAudiences[0].id,
    "org",
  );
});


test("Organization manager reporting retains unassigned members while subteam managers remain scoped", async () => {
 const {teamProgressRows} = await import("../lib/reporting");
 const data = freshWorkspace();
 const manager = {...data.users[0], id: "manager", role: "manager" as const, active: true};
 const childManager = {...manager, id: "child-manager"};
 data.teams = [{id: "org", name: "Organization", system: "organization", managerId: manager.id}, {id: "child", name: "Child", parentId: "org", managerId: childManager.id}];
 data.users = [{...data.users[1], id: "root-member", teamId: undefined}, {...data.users[1], id: "child-member", teamId: "child"}];
 assert.deepEqual(teamProgressRows(data, manager).map(r=>r.u.id), ["root-member", "child-member"]);
 assert.equal(teamProgressRows(data, manager)[0].team, "Organization");
 assert.deepEqual(teamProgressRows(data, childManager).map(r=>r.u.id), ["child-member"]);
});
