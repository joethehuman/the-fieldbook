import assert from "node:assert/strict";
import { test } from "node:test";
import { learningTarget } from "../lib/learning";
import { assignedCourses } from "../lib/types";
import { governanceSchema } from "../server/governance-schema";

const admin = "00000000-0000-4000-8000-000000000001",
  manager = "00000000-0000-4000-8000-000000000002",
  learner = "00000000-0000-4000-8000-000000000003",
  outsider = "00000000-0000-4000-8000-000000000004";
const groups = [
  { id: "all", name: "Everyone" },
  { id: "sales", name: "Sales", parentId: "all" },
  { id: "other", name: "Other" },
];
const teams = [
  { id: "west", name: "West", managerId: manager },
  { id: "child", name: "West child", parentId: "west" },
  { id: "east", name: "East" },
];
const users = [
  {
    id: admin,
    name: "Admin",
    email: "admin@example.test",
    role: "admin",
    active: true,
    groups: [],
  },
  {
    id: manager,
    name: "Manager",
    email: "manager@example.test",
    role: "manager",
    active: true,
    groups: [],
    teamId: "east",
  },
  {
    id: learner,
    name: "Learner",
    email: "learner@example.test",
    role: "learner",
    active: true,
    groups: ["sales"],
    teamId: "child",
  },
  {
    id: outsider,
    name: "Other",
    email: "other@example.test",
    role: "learner",
    active: true,
    groups: ["other"],
    teamId: "east",
  },
];

test("governance request validation rejects group hierarchy, team cycles, missing parents and invalid membership", () => {
  const data = {
    expected: 1,
    users,
    groups: groups.map(({ parentId: _parent, ...group }) => group),
    teams: [
      { id: "organization", name: "Organization", system: "organization" },
      ...teams.map((team) => ({
        ...team,
        parentId: team.parentId || "organization",
      })),
    ],
  };
  assert.equal(governanceSchema.safeParse(data).success, true);
  for (const bad of [
    {
      ...data,
      groups: [
        { id: "all", name: "All", parentId: "sales" },
        groups[1],
        groups[2],
      ],
    },
    {
      ...data,
      teams: data.teams.map((team) =>
        team.id === "west" ? { ...team, parentId: "missing" } : team,
      ),
    },
    {
      ...data,
      teams: data.teams.map((team) =>
        team.id === "west" ? { ...team, parentId: "child" } : team,
      ),
    },
    { ...data, users: [...users, users[0]] },
    { ...data, groups: [] },
  ])
    assert.equal(governanceSchema.safeParse(bad).success, false);
});

test("effective group membership controls catch-up timing without gating catalog visibility", () => {
  const user: any = {
    ...users[2],
    effectiveGroupJoinedAt: {
      all: "2026-09-20T12:00:00Z",
      sales: "2026-09-01T00:00:00Z",
    },
  };
  const course: any = {
    kind: "course",
    status: "published",
    groups: ["all"],
    assignments: [
      {
        groupId: "all",
        assignedAt: "2026-09-10T00:00:00Z",
        due: { type: "none" },
      },
      {
        groupId: "sales",
        assignedAt: "2026-09-10T00:00:00Z",
        due: { type: "none" },
      },
    ],
  };
  assert.equal(learningTarget(course, user, groups), "2026-10-10");
  assert.equal(assignedCourses([course], user, groups).length, 1);
  assert.equal(
    assignedCourses([course], { ...user, groups: [] }, groups).length,
    0,
  );
  assert.equal(course.status, "published");
});
