import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import { organizationTeam } from "../lib/organization-team";
import {
  assignLearningToAudiences,
  courseAudienceSources,
  projectAssignmentTeams,
  learningChangeImpact,
} from "../lib/assignment-audiences";
import { reconcileLearning } from "../lib/learning-groups";
import { effectiveGroups, assignedCourses } from "../lib/types";
import { governanceSchema } from "../server/governance-schema";

test("mixed sources use implicit Organization and preserve a fixed course/version deadline through source replacement", () => {
  let data = freshWorkspace();
  const root = organizationTeam(data.teams!)!;
  const course = data.content.find((c) => c.kind === "course")!;
  data.content = [course];
  data.publishedContent = [structuredClone(course)];
  data.groups = [
    {
      id: "audience",
      name: "Audience",
      learningItems: [{ kind: "course", id: course.id }],
    },
  ];
  data.users = [
    {
      ...data.users[0],
      groups: ["audience"],
      teamId: undefined,
      hireDate: "2026-01-01",
      onboardingDays: 90,
    },
  ];
  data = reconcileLearning(
    { ...data, users: [] },
    data,
    "2026-02-01T00:00:00Z",
  );
  const first = data.users[0].learningAssignments![0];
  const next = assignLearningToAudiences(
    data,
    [{ kind: "course", id: course.id }],
    [`team:${root.id}`],
  );
  assert.equal(learningChangeImpact(data, next)[0].changed.length, 1);
  assert.equal(learningChangeImpact(data, next)[0].lost.length, 0);
  data = reconcileLearning(data, next, "2026-03-01T00:00:00Z");
  assert.equal(data.users[0].teamId, undefined);
  assert.deepEqual(
    projectAssignmentTeams(data.users[0], data).map((t) => t.id),
    [root.id],
  );
  assert.deepEqual(courseAudienceSources(data, data.users[0], course.id), [
    { kind: "team", id: root.id },
  ]);
  const after = data.users[0].learningAssignments![0];
  assert.equal(after.episodeId, first.episodeId);
  assert.equal(after.dueDate, first.dueDate);
  assert.equal(after.assignedAt, first.assignedAt);
  assert.equal(
    assignedCourses(data.content, data.users[0], data.groups).length,
    1,
  );
  const moved = reconcileLearning(
    data,
    { ...data, users: [{ ...data.users[0], teamId: "sales-team" }] },
    "2026-03-02T00:00:00Z",
  );
  assert.equal(
    moved.users[0].learningAssignments![0].episodeId,
    first.episodeId,
  );
  assert.deepEqual(moved.progress, data.progress);
});
test("flat linked audiences preserve direct-only sources while Team assignments include descendants", () => {
  const data = freshWorkspace();
  const root = organizationTeam(data.teams!)!;
  data.teams = [
    root,
    { id: "sales", name: "Sales", parentId: root.id },
    { id: "child", name: "Child", parentId: "sales" },
  ];
  data.groups = [
    { id: "direct", name: "Direct", legacyDirectTeamIds: ["sales"] },
    { id: "branch", name: "Branch", teamIds: ["sales"] },
  ];
  const person = {
    ...data.users[0],
    groups: [],
    teamId: "child",
    effectiveGroupIds: undefined,
    assignmentTeams: undefined,
  };
  assert.deepEqual(
    [...effectiveGroups(person, data.groups, data.teams)],
    ["branch"],
  );
  const course = data.content.find((c) => c.kind === "course")!;
  const next = assignLearningToAudiences(
    data,
    [{ kind: "course", id: course.id }],
    ["team:sales", "group:direct", "group:branch"],
  );
  assert.deepEqual(
    courseAudienceSources(next, person, course.id)
      .map((a) => `${a.kind}:${a.id}`)
      .sort(),
    ["group:branch", "team:sales"],
  );
});
test("combined governance retains the protected root marker and validates Team curriculum plans", () => {
  const data = freshWorkspace();
  const request = {
    expected: 1,
    groups: [],
    teams: data.teams!.map(({ managerId, requiredCourseIds, ...team }) => team),
    curricula: [
      {
        id: "list",
        name: "List",
        description: "",
        courseIds: ["00000000-0000-4000-8000-000000000001"],
        status: "published",
      },
    ],
    users: [],
  };
  const root = organizationTeam(data.teams!)!;
  request.teams = request.teams.map((t) =>
    t.id === root.id
      ? { ...t, learningItems: [{ kind: "curriculum" as const, id: "list" }] }
      : t,
  );
  assert.equal(governanceSchema.safeParse(request).success, true);
  assert.equal(
    governanceSchema.safeParse({
      ...request,
      curricula: [{ ...request.curricula[0], status: "draft" }],
    }).success,
    false,
  );
  assert.equal(
    governanceSchema.safeParse({
      ...request,
      teams: data.teams!.filter((t) => t.id !== root.id),
    }).success,
    false,
  );
});

test("group-only edits preserve direct Team plans and a continuously assigned episode", async () => {
  const { assignLearningToGroups } = await import("../lib/group-assignment");
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
    "2026-02-01T00:00:00Z",
  );
  const before = data.users[0].learningAssignments!.find(
    (a) => a.contentId === course.id,
  )!;
  const changed = assignLearningToGroups(
    data,
    { kind: "course", id: course.id },
    [],
  );
  assert.deepEqual(changed.teams, data.teams);
  const after = reconcileLearning(data, changed, "2026-03-01T00:00:00Z");
  const current = after.users[0].learningAssignments!.find(
    (a) => a.contentId === course.id,
  )!;
  assert.equal(current.episodeId, before.episodeId);
  assert.equal(current.dueDate, before.dueDate);
  assert.ok(
    current.sourceAudiences?.some(
      (a) => a.kind === "team" && a.id === "sales-team",
    ),
  );
  assert.deepEqual(after.progress, data.progress);
});

test("legacy required-course Team plans normalize without dropping learning or deletion blockers", async () => {
  const { teamDeletionBlockers } = await import("../lib/team-hierarchy");
  const data = freshWorkspace();
  const course = data.content.find((c) => c.kind === "course")!;
  data.groups = [];
  data.teams = data.teams!.map((t) =>
    t.id === "sales-team"
      ? { ...t, learningItems: undefined, requiredCourseIds: [course.id] }
      : t,
  );
  assert.deepEqual(teamDeletionBlockers(data, "sales-team").learning, [
    { kind: "course", id: course.id },
  ]);
  const next = reconcileLearning(data, data, "2026-02-01T00:00:00Z");
  assert.deepEqual(
    next.teams!.find((t) => t.id === "sales-team")!.learningItems,
    [{ kind: "course", id: course.id }],
  );
  assert.equal(next.users[0].learningAssignments?.length, 1);
  assert.deepEqual(next.users[0].learningAssignments![0].sourceAudiences, [
    { kind: "team", id: "sales-team" },
  ]);
});
