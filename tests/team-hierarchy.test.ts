import assert from "node:assert/strict";
import test from "node:test";
import { freshWorkspace } from "../lib/store";
import {
  deleteTeams,
  moveTeam,
  teamDeletionBlockers,
  teamMoveImpact,
} from "../lib/team-hierarchy";
import { effectiveGroups, reportTeamIds, type User } from "../lib/types";

function fixture() {
  const data = freshWorkspace();
  const user = (
    id: string,
    role: User["role"] = "manager",
    teamId?: string,
  ): User => ({
    id,
    name: id,
    email: `${id}@example.test`,
    role,
    teamId,
    active: true,
    groups: [],
  });
  data.users = [
    user("old"),
    user("new"),
    user("branch-manager"),
    user("overlap"),
    user("admin", "admin"),
    user("person", "learner", "leaf"),
  ];
  data.teams = [
    { id: "old", name: "Old parent", managerId: "old" },
    { id: "new", name: "New parent", managerId: "new" },
    {
      id: "branch",
      name: "Branch",
      parentId: "old",
      managerId: "branch-manager",
    },
    { id: "leaf", name: "Leaf", parentId: "branch", managerId: "overlap" },
    {
      id: "overlap",
      name: "Already managed",
      parentId: "new",
      managerId: "overlap",
    },
  ];
  data.groups = [{ id: "linked", name: "Linked", teamIds: ["leaf"] }];
  return data;
}

test("branch moves preserve membership and learning, preview actual manager scope, and reject cycles", () => {
  const data = fixture();
  const before = structuredClone(data);
  const impact = teamMoveImpact(data, "branch", "new");
  assert.deepEqual(data, before);
  assert.equal(impact.from, "Old parent / Branch");
  assert.equal(impact.to, "New parent / Branch");
  assert.equal(impact.branch.length, 2);
  assert.equal(impact.people.length, 1);
  assert.deepEqual(
    impact.managers.map(({ manager, gainedPeople, lostPeople }) => [
      manager.id,
      gainedPeople,
      lostPeople,
    ]),
    [
      ["old", 0, 1],
      ["new", 1, 0],
    ],
  );
  assert.equal(
    impact.next.find((team) => team.id === "leaf")?.parentId,
    "branch",
  );
  const learner = data.users.find((user) => user.id === "person")!;
  assert.deepEqual([...effectiveGroups(learner, data.groups)], ["linked"]);
  assert.throws(() => moveTeam(data.teams!, "branch", "leaf"), /cannot sit/);
  assert.throws(() => moveTeam(data.teams!, "branch", "branch"), /cannot sit/);
  assert.throws(() => moveTeam(data.teams!, "branch", "old"), /already/);
  assert.throws(() => moveTeam(data.teams!, "branch", "missing"), /changed/);
  const detached = moveTeam(impact.next, "branch", "");
  assert.equal(
    detached.find((team) => team.id === "branch")?.parentId,
    undefined,
  );
  assert.deepEqual(
    [...reportTeamIds(data.users[2], detached)],
    ["branch", "leaf"],
  );
  assert.equal(teamDeletionBlockers(data, "leaf").members.length, 1);
  assert.equal(teamDeletionBlockers(data, "leaf").groups.length, 1);
  assert.equal(teamDeletionBlockers(data, "branch").children.length, 1);
});

test("reviewed team deletion moves direct users to Organization and keeps unselected branches and history", () => {
  const data = freshWorkspace();
  const root = data.teams!.find((t) => t.system === "organization")!;
  data.teams = [
    root,
    { id: "parent", name: "Parent", parentId: root.id },
    { id: "branch", name: "Branch", parentId: "parent" },
    { id: "child", name: "Child", parentId: "branch" },
  ];
  const user = data.users[0];
  data.users = [
    { ...user, id: "one", teamId: "branch" },
    { ...user, id: "two", teamId: "child", active: false },
    { ...user, id: "three", teamId: "parent" },
  ];
  data.groups = [];
  data.pendingUsers = [
    {
      email: "pending@example.test",
      name: "Pending",
      role: "learner",
      groups: [],
      teamId: "child",
    },
  ];
  const before = structuredClone(data);
  const parentOnly = deleteTeams(data, ["branch"]);
  assert.equal(
    parentOnly.teams.find((t) => t.id === "child")!.parentId,
    root.id,
  );
  assert.equal(parentOnly.users[1].teamId, "child");
  assert.equal(parentOnly.users[0].teamId, undefined);
  assert.throws(() => deleteTeams(data, [root.id]), /Organization cannot/);
  const next = deleteTeams(data, ["branch", "child"]);
  assert.deepEqual(data, before);
  assert.deepEqual(
    next.teams.map((t) => t.id),
    [root.id, "parent"],
  );
  assert.equal(next.users[0].teamId, undefined);
  assert.equal(next.users[1].teamId, undefined);
  assert.equal(next.users[2].teamId, "parent");
  assert.equal(next.pendingUsers![0].teamId, undefined);
  assert.deepEqual(next.progress, before.progress);
  assert.deepEqual(
    next.users.map(({ teamId, ...u }) => u),
    before.users.map(({ teamId, ...u }) => u),
  );
  for (const blocker of [
    { learningItems: [{ kind: "course" as const, id: "course" }] },
    {},
  ]) {
    const linked = structuredClone(data);
    Object.assign(linked.teams![2], blocker);
    if (!("learningItems" in blocker))
      linked.groups = [{ id: "group", name: "Group", teamIds: ["branch"] }];
    assert.throws(() => deleteTeams(linked, ["branch", "child"]), /learning/);
  }
});
