import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import { groupMembershipSources, groupMoveImpact, groupPath, moveGroup } from "../lib/group-hierarchy";
import { effectiveGroups } from "../lib/types";

test("group paths and membership sources explain overlapping direct, team, and child inclusion", () => {
  const data = freshWorkspace();
  data.groups = [
    { id: "root", name: "Sales" },
    { id: "child", name: "West", parentId: "root", teamIds: ["team"] },
    { id: "leaf", name: "Accounts", parentId: "child" },
  ];
  data.teams = [{ id: "team", name: "Territory" }];
  const user = { ...data.users[0], groups: ["root", "leaf"], teamId: "team" };
  assert.equal(groupPath("leaf", data.groups), "Sales / West / Accounts");
  assert.deepEqual(groupMembershipSources(user, "root", data), [
    "Directly added",
    "Via child group Sales / West / Accounts",
    "Via team Territory linked to Sales / West",
  ]);
  assert.equal(effectiveGroups(user, data.groups).size, 3);
});

test("group move carries its descendants, preserves IDs and rejects cycles and missing targets", () => {
  const data = freshWorkspace();
  data.groups = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "child", name: "Child", parentId: "a" },
    { id: "leaf", name: "Leaf", parentId: "child" },
  ];
  const impact = groupMoveImpact(data, "child", "b");
  assert.equal(impact.from, "A / Child");
  assert.equal(impact.to, "B / Child");
  assert.deepEqual(impact.branch.map((group) => group.id), ["child", "leaf"]);
  assert.equal(impact.next.find((group) => group.id === "leaf")?.parentId, "child");
  assert.throws(() => moveGroup(data.groups, "a", "leaf"), /cannot move/);
  assert.throws(() => moveGroup(data.groups, "child", "missing"), /changed/);
});
