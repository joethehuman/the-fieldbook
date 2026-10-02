import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import { groupMembershipSources, groupPath } from "../lib/group-hierarchy";
import { effectiveGroups } from "../lib/types";

test("flat group names and membership sources explain overlapping individual and team inclusion", () => {
  const data = freshWorkspace();
  data.groups = [
    { id: "root", name: "Sales", teamIds: ["team"] },
    { id: "child", name: "West", teamIds: ["team"] },
    { id: "leaf", name: "Accounts" },
  ];
  data.teams = [{ id: "team", name: "Territory" }];
  const user = { ...data.users[0], groups: ["root", "leaf"], teamId: "team" };
  assert.equal(groupPath("leaf", data.groups), "Accounts");
  assert.deepEqual(groupMembershipSources(user, "root", data), [
    "Individually added",
    "Territory (includes subteams)",
  ]);
  assert.equal(effectiveGroups(user, data.groups).size, 3);
});

test("legacy parent fields do not restore hierarchy or hidden inherited membership", () => {
  const data = freshWorkspace();
  data.groups = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "child", name: "Child", parentId: "a" },
    { id: "leaf", name: "Leaf", parentId: "child" },
  ];
  const user = { ...data.users[0], groups: ["leaf"], teamId: undefined };
  assert.deepEqual([...effectiveGroups(user, data.groups)], ["leaf"]);
  assert.deepEqual(groupMembershipSources(user, "a", data), []);
});
