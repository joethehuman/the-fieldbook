import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import { audienceTransfer } from "../lib/audience-transfer";
import { contentAudienceKey } from "../lib/content-audiences";
function fixture() {
  const data = freshWorkspace();
  data.settings = {
    ...data.settings!,
    access: "public",
    guestGroupId: "guests",
  };
  data.teams = [
    { id: "org", name: "Organization", system: "organization" },
    { id: "sales", name: "Sales", parentId: "org" },
    { id: "enterprise", name: "Enterprise", parentId: "sales" },
    { id: "new", name: "New territory", parentId: "enterprise" },
    { id: "support", name: "Support", parentId: "org" },
  ];
  data.groups = [
    { id: "linked", name: "Revenue", teamIds: ["sales"] },
    { id: "overlap", name: "Pilot" },
    {
      id: "legacy",
      name: "Direct-only",
      teamIds: ["sales"],
      teamLinkScope: "direct",
    },
    { id: "guests", name: "Visitors" },
  ];
  data.users = data.users.slice(0, 1).map((user) => ({
    ...user,
    active: true,
    teamId: "enterprise",
    groups: ["overlap", "guests"],
  }));
  return data;
}
const availableKeys = (model: ReturnType<typeof audienceTransfer>) =>
  model.available.map(contentAudienceKey);
test("parent addition removes durable descendants from Available and removal restores them", () => {
  const data = fixture();
  assert(availableKeys(audienceTransfer(data, [])).includes("team:new"));
  const assigned = audienceTransfer(data, ["team:sales"]);
  assert(!availableKeys(assigned).includes("team:enterprise"));
  assert(!availableKeys(assigned).includes("team:new"));
  assert(availableKeys(assigned).includes("team:support"));
  assert.deepEqual(
    assigned
      .includedTeams(assigned.options.find((option) => option.id === "sales")!)
      .map((team) => team.id),
    ["enterprise", "new"],
  );
  assert(availableKeys(audienceTransfer(data, [])).includes("team:new"));
});
test("separately saved child survives parent removal and overlaps appear under both sources", () => {
  const data = fixture();
  const keys = ["team:enterprise", "team:sales", "group:linked"];
  const model = audienceTransfer(data, keys);
  for (const key of ["team:sales", "group:linked"])
    assert(
      model
        .includedTeams(
          model.options.find((option) => contentAudienceKey(option) === key)!,
        )
        .some((team) => team.id === "enterprise"),
    );
  const childOnly = audienceTransfer(data, ["team:enterprise"]);
  assert(!availableKeys(childOnly).includes("team:new"));
  assert(availableKeys(childOnly).includes("team:sales"));
  assert.deepEqual(keys, ["team:enterprise", "team:sales", "group:linked"]);
});
test("current-member group overlap never hides a future assignment source", () => {
  const model = audienceTransfer(fixture(), ["team:sales"]);
  assert(availableKeys(model).includes("group:overlap"));
  assert(availableKeys(model).includes("group:linked"));
});
test("legacy direct-only links explain direct membership without covering a team subtree", () => {
  const model = audienceTransfer(fixture(), ["group:legacy"]);
  assert(availableKeys(model).includes("team:sales"));
  assert(availableKeys(model).includes("team:enterprise"));
  assert.deepEqual(
    model
      .includedTeams(model.options.find((option) => option.id === "legacy")!)
      .map((team) => [team.id, team.directMembersOnly]),
    [["sales", true]],
  );
});
test("inherited curriculum sources continue to cover teams after a direct removal", () => {
  const model = audienceTransfer(fixture(), [], {
    "group:linked": ["Foundations"],
  });
  assert(!availableKeys(model).includes("group:linked"));
  assert(!availableKeys(model).includes("team:enterprise"));
  assert.equal(model.coveredBy.get("team:enterprise")![0].id, "linked");
});
test("Organization includes registered people while guest targeting remains independent", () => {
  const model = audienceTransfer(fixture(), ["team:org"]);
  assert.deepEqual(availableKeys(model), ["group:guests"]);
  assert.equal(model.people.get("group:guests")?.size, 1);
});
test("empty and missing sources are safe and summary-free authors see group choices only", () => {
  const data = fixture();
  data.users = [];
  const model = audienceTransfer(data, ["group:missing"], {}, false);
  assert(model.available.every((option) => option.kind === "group"));
  assert.equal(
    model.includedTeams({ kind: "group", id: "missing", name: "Removed" })
      .length,
    0,
  );
});
