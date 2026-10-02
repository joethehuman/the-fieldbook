import test from "node:test";
import assert from "node:assert/strict";
import {
  organizationTeam,
  organizationParent,
  validateOrganizationTeams,
  withOrganizationTeam,
} from "../lib/organization-team";
import { defaultSettings, publicSettings } from "../lib/settings";
import { settingsSchema } from "../server/schemas";
import { governanceSchema } from "../server/governance-schema";
import { freshWorkspace, loadWorkspace, saveWorkspace } from "../lib/store";
import { moveTeam, teamDeletionBlockers } from "../lib/team-hierarchy";
import { reportTeamIds, type Team } from "../lib/types";

const teams: Team[] = [
  { id: "organization", name: "Company", system: "organization" },
  { id: "sales", name: "Sales", parentId: "organization" },
  { id: "us", name: "US", parentId: "sales" },
];

test("Organization is one marked root with stable identity, never guessed from names", () => {
  assert.equal(organizationTeam(teams, "organization"), teams[0]);
  assert.equal(organizationTeam(teams), teams[0]);
  assert.equal(organizationTeam(teams, "missing"), undefined);
  assert.equal(
    organizationTeam(teams.map(({ system, ...team }) => team)),
    undefined,
  );
  assert.equal(
    organizationTeam([...teams, { id: "other", name: "Other" }]),
    undefined,
  );
  assert.equal(organizationParent(teams, "sales"), "sales");
  assert.equal(organizationParent(teams, ""), "organization");
});

test("Organization preserves its name and identity while manager and direct membership can change", () => {
  validateOrganizationTeams(teams, "organization");
  validateOrganizationTeams(
    [{ ...teams[0], managerId: crypto.randomUUID() }, ...teams.slice(1)],
    "organization",
    teams,
    "organization",
  );
  for (const changed of [
    teams.slice(1),
    [{ ...teams[0], name: "Renamed" }, ...teams.slice(1)],
    [{ ...teams[0], parentId: "sales" }, ...teams.slice(1)],
    [{ ...teams[0], system: undefined }, ...teams.slice(1)],
    [teams[0], { ...teams[1], parentId: undefined }, teams[2]],
    [teams[0], { ...teams[1], parentId: "missing" }, teams[2]],
  ])
    assert.throws(() =>
      validateOrganizationTeams(changed, "organization", teams, "organization"),
    );
  assert.throws(
    () => moveTeam(teams, "organization", "sales"),
    /cannot be moved/,
  );
  const moved = moveTeam(teams, "us", "");
  assert.equal(
    moved.find((team) => team.id === "us")?.parentId,
    "organization",
  );
  const workspace = {
    ...freshWorkspace(),
    teams,
    settings: { ...defaultSettings, organizationTeamId: "organization" },
  };
  assert.equal(
    teamDeletionBlockers(workspace, "organization").organization,
    true,
  );
  assert.equal(teamDeletionBlockers(workspace, "sales").organization, false);
});

test("legacy normalization attaches only former roots and leaves users, learning, progress and manager scope intact", () => {
  const data = freshWorkspace();
  data.settings!.organizationTeamId = null;
  data.teams = [
    { id: "sales-team", name: "Sales", managerId: "demo-manager" },
    { id: "support", name: "Support" },
    { id: "leaf", name: "Leaf", parentId: "sales-team" },
  ];
  const before = structuredClone(data);
  const scope = [
    ...reportTeamIds(
      data.users.find((u) => u.id === "demo-manager")!,
      data.teams,
    ),
  ];
  const converted = withOrganizationTeam(data);
  const root = organizationTeam(
    converted.teams!,
    converted.settings!.organizationTeamId,
  )!;
  assert.equal(root.name, "Organization");
  assert.equal(root.managerId, undefined);
  assert.equal(
    converted.teams!.find((team) => team.id === "sales-team")!.parentId,
    root.id,
  );
  assert.equal(
    converted.teams!.find((team) => team.id === "support")!.parentId,
    root.id,
  );
  assert.equal(
    converted.teams!.find((team) => team.id === "leaf")!.parentId,
    "sales-team",
  );
  assert.deepEqual(converted.users, before.users);
  assert.deepEqual(converted.groups, before.groups);
  assert.deepEqual(converted.content, before.content);
  assert.deepEqual(converted.progress, before.progress);
  assert.deepEqual(
    [
      ...reportTeamIds(
        converted.users.find((u) => u.id === "demo-manager")!,
        converted.teams!,
      ),
    ],
    scope,
  );
  assert.equal(withOrganizationTeam(converted), converted);
  assert.deepEqual(data, before);
});

test("explicit old sole-root selection preserves members, manager, identity and historical name", () => {
  const data = freshWorkspace();
  data.teams = [
    {
      id: "sales-team",
      name: "Existing organization",
      managerId: "demo-manager",
    },
    { id: "leaf", name: "Leaf", parentId: "sales-team" },
  ];
  data.settings!.organizationTeamId = "sales-team";
  const converted = withOrganizationTeam(data);
  assert.deepEqual(organizationTeam(converted.teams!), {
    ...data.teams[0],
    system: "organization",
  });
  assert.deepEqual(converted.users, data.users);
  assert.equal(converted.teams!.length, 2);
  const manager = converted.users.find((u) => u.id === "demo-manager")!;
  assert.deepEqual(
    [...reportTeamIds(manager, converted.teams!)],
    ["sales-team", "leaf"],
  );
});

test("a newly assigned Organization manager gets team-and-descendant reporting, without enrolling unassigned users", () => {
  const data = freshWorkspace();
  const root = organizationTeam(data.teams!)!;
  const contributor = data.users.find((u) => u.role === "contributor")!;
  const next = data.teams!.map((team) =>
    team.id === root.id ? { ...team, managerId: contributor.id } : team,
  );
  assert.deepEqual(
    [...reportTeamIds(contributor, next)],
    next.map((team) => team.id),
  );
  assert.equal(contributor.teamId, undefined);
  assert.equal(data.users.find((u) => u.role === "admin")!.teamId, undefined);
  assert.equal(
    data.groups.some((g) => g.teamIds?.includes(root.id)),
    false,
  );
});

test("fresh and persisted browser demo have the root; ordinary writes cannot delete, rename or replace it", () => {
  const original = globalThis.localStorage;
  const values = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] || null,
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  try {
    const data = loadWorkspace();
    const root = organizationTeam(data.teams!)!;
    assert.equal(root.name, "Organization");
    assert.equal(data.settings!.organizationTeamId, root.id);
    const bad = structuredClone(data);
    bad.teams = bad.teams!.filter((team) => team.id !== root.id);
    assert.throws(() => saveWorkspace(bad), /Organization/);
    bad.teams = data.teams!.map((team) =>
      team.id === root.id ? { ...team, name: "Changed" } : team,
    );
    assert.throws(() => saveWorkspace(bad), /Organization/);
    assert.deepEqual(loadWorkspace().teams, data.teams);
  } finally {
    globalThis.localStorage = original;
  }
});

test("governance preserves the system marker and rejects a second root; public settings omit root identity", () => {
  const parsed = governanceSchema.parse({
    expected: 1,
    groups: [],
    teams,
    users: [],
  });
  assert.equal(parsed.teams[0].system, "organization");
  assert.equal(
    governanceSchema.safeParse({
      expected: 1,
      groups: [],
      teams: [],
      users: [],
    }).success,
    false,
  );
  assert.equal(
    governanceSchema.safeParse({
      expected: 1,
      groups: [],
      teams: [...teams, { id: "other", name: "Other" }],
      users: [],
    }).success,
    false,
  );
  const settings = settingsSchema.parse({
    ...defaultSettings,
    organizationTeamId: "organization",
  });
  assert.equal("organizationTeamId" in publicSettings(settings), false);
});
