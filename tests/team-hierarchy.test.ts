import { migrationSql } from "./helpers/migration-sql.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { freshWorkspace } from "../lib/store";
import {
  deleteTeams,
  moveTeam,
  teamMoveImpact,
  teamDeletionBlockers,
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

test("guarded deletion migration: stored references, revision, authorization and audit remain atomic", async () => {
  const pg = new PGlite();
  const admin = "00000000-0000-4000-8000-000000000001";
  const inactive = "00000000-0000-4000-8000-000000000002";
  try {
    await pg.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    );
    for (const name of [
      "202609190001_fieldbook.sql",
      "202609190002_mcp_audience.sql",
      "202609200001_governance.sql",
      "202609200002_assignments.sql",
      "202609200003_required_learning.sql",
      "202609200004_learning_groups.sql",
      "20260923180607_guarded_team_deletion.sql",
      "20260923230000_scope_pending_group_cleanup.sql",
    ])
      await pg.exec(migrationSql(name));
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
        id: inactive,
        name: "Inactive",
        email: "inactive@example.test",
        role: "learner",
        active: false,
        groups: [],
        teamId: "member",
      },
    ];
    for (const user of users) {
      await pg.query("insert into auth.users values($1)", [user.id]);
      await pg.query(
        "insert into public.fb_profiles(id,name,email,role,active,groups,team_id) values($1,$2,$3,$4,$5,'[]',$6)",
        [
          user.id,
          user.name,
          user.email,
          user.role,
          user.active,
          user.teamId || null,
        ],
      );
    }
    const teams = [
      { id: "empty", name: "Empty", managerId: admin },
      { id: "member", name: "Member" },
      { id: "pending", name: "Pending" },
      { id: "parent", name: "Parent" },
      { id: "child", name: "Child", parentId: "parent" },
      { id: "linked", name: "Linked" },
    ];
    const groups = [
      {
        id: "learning",
        name: "Learning",
        teamIds: ["linked"],
        learningItems: [],
      },
    ];
    await pg.query("update public.fb_config set teams=$1,groups=$2", [
      JSON.stringify(teams),
      JSON.stringify(groups),
    ]);
    await pg.exec(
      "insert into public.fb_pending_profiles(email,name,role,groups,team_id) values('pending@example.test','Pending','learner','[]','pending')",
    );
    const save = (id: string, actor = admin, revision = 1, extras = {}) =>
      pg.query("select public.fb_save_governance($1,$2,'save',$3)", [
        actor,
        revision,
        JSON.stringify({
          users,
          teams: teams.filter((team) => team.id !== id),
          groups,
          curricula: [],
          ...extras,
        }),
      ]);
    await assert.rejects(
      save("member", admin, 1, {
        users: users.map((user) => ({ ...user, teamId: undefined })),
      }),
      /direct members/,
    );
    await assert.rejects(save("pending"), /pending account/);
    await assert.rejects(
      save("parent", admin, 1, {
        teams: teams
          .filter((team) => team.id !== "parent")
          .map((team) => ({ ...team, parentId: undefined })),
      }),
      /Move subteams/,
    );
    await assert.rejects(
      save("linked", admin, 1, { groups: [{ ...groups[0], teamIds: [] }] }),
      /learning-group links/,
    );
    await assert.rejects(save("empty", inactive), /Administrator access/);
    await assert.rejects(save("empty", admin, 9), /Revision conflict/);
    assert.equal(
      (
        await pg.query<{ governance_revision: number }>(
          "select governance_revision from public.fb_config",
        )
      ).rows[0].governance_revision,
      1,
    );
    await save("empty");
    const config = (
      await pg.query<{ teams: typeof teams; governance_revision: number }>(
        "select teams,governance_revision from public.fb_config",
      )
    ).rows[0];
    assert.equal(
      config.teams.some((team) => team.id === "empty"),
      false,
    );
    assert.equal(config.governance_revision, 2);
    assert.equal(
      (
        await pg.query(
          "select * from public.fb_audit where action='governance_save'",
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await pg.query<{ team_id: string }>(
          "select team_id from public.fb_profiles where id=$1",
          [inactive],
        )
      ).rows[0].team_id,
      "member",
    );
    const privilege = (
      await pg.query<{ allowed: boolean; elevated: boolean }>(
        "select has_function_privilege('authenticated','public.fb_save_governance(uuid,integer,text,jsonb)','execute') as allowed,prosecdef as elevated from pg_proc where oid='public.fb_save_governance(uuid,integer,text,jsonb)'::regprocedure",
      )
    ).rows[0];
    assert.equal(privilege.allowed, false);
    assert.equal(privilege.elevated, false);
    await pg.query(
      "update public.fb_pending_profiles set groups='[\"learning\"]'::jsonb where email='pending@example.test'",
    );
    await pg.query(
      "insert into public.fb_pending_profiles(email,name,role,groups) values('unaffected@example.test','Unaffected','learner','[]')",
    );
    await save("empty", admin, 2, { teams: config.teams, groups: [] });
    const pendingGroups = (
      await pg.query<{ email: string; groups: string[] }>(
        "select email,groups from public.fb_pending_profiles order by email",
      )
    ).rows;
    assert.deepEqual(pendingGroups, [
      { email: "pending@example.test", groups: [] },
      { email: "unaffected@example.test", groups: [] },
    ]);
  } finally {
    await pg.close();
  }
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
