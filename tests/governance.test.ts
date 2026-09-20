import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { governanceSchema } from "../production/lib/governance-schema";
import { learningTarget } from "../lib/learning";
import { assignedCourses } from "../lib/types";

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

test("governance request validation rejects cycles, missing parents and invalid membership", () => {
  const data = { expected: 1, users, groups, teams };
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
    { ...data, teams: [{ id: "west", name: "West", parentId: "missing" }] },
    { ...data, users: [...users, users[0]] },
    { ...data, groups: [] },
  ])
    assert.equal(governanceSchema.safeParse(bad).success, false);
});

test("governance database enforces permissions, revision, hierarchy, registration and report scope", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    );
    for (const name of [
      "202609190001_fieldbook.sql",
      "202609190002_mcp_audience.sql",
      "202609200001_governance.sql",
    ])
      await pg.exec(
        await readFile(
          new URL(`../supabase/migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
    for (const u of users) {
      await pg.query("insert into auth.users values($1)", [u.id]);
      await pg.query(
        "insert into public.fb_profiles(id,name,email,role) values($1,$2,$3,$4)",
        [u.id, u.name, u.email, u.role],
      );
    }
    const save = (
      expected: number,
      data: any,
      who = admin,
      operation = "save",
    ) =>
      pg.query<any>("select public.fb_save_governance($1,$2,$3,$4) as result", [
        who,
        expected,
        operation,
        JSON.stringify(data),
      ]);
    const data = { users, groups, teams };
    await assert.rejects(save(1, data, manager), /Administrator/);
    await pg.exec("set role service_role");
    await save(1, data);
    await pg.exec("reset role");
    await assert.rejects(save(1, data), /Revision conflict/);
    await assert.rejects(
      save(2, {
        ...data,
        users: users.map((u) => (u.id === admin ? { ...u, active: false } : u)),
      }),
      /own administrator/,
    );
    await assert.rejects(
      save(2, {
        ...data,
        groups: [{ ...groups[0], parentId: "sales" }, groups[1], groups[2]],
      }),
      /cycle/,
    );
    await assert.rejects(
      save(2, {
        ...data,
        teams: [{ ...teams[0], managerId: learner }, ...teams.slice(1)],
      }),
      /active managers/,
    );
    await assert.rejects(
      save(2, { ...data, users: users.slice(1) }),
      /People changed/,
    );
    const snapshot = async (id: string) =>
      (
        await pg.query<any>(
          "select public.fb_governance_snapshot($1) as result",
          [id],
        )
      ).rows[0].result;
    assert.deepEqual(
      (await snapshot(manager)).users.map((u: any) => u.id).sort(),
      [manager, learner].sort(),
    );
    assert.deepEqual(
      (await snapshot(manager)).teams.map((t: any) => t.id).sort(),
      ["child", "west"],
    );
    assert.deepEqual(
      (await snapshot(learner)).users.map((u: any) => u.id),
      [learner],
    );
    assert.equal((await snapshot(outsider)).teams.length, 0);
    const before = (await snapshot(learner)).users[0].effective_group_joined_at;
    assert.ok(before.all && before.sales);
    // Reparent: a newly acquired ancestor starts now, continuous direct membership remains.
    const moved = [groups[0], { ...groups[1], parentId: "other" }, groups[2]];
    await save(2, { ...data, groups: moved });
    const after = (await snapshot(learner)).users[0].effective_group_joined_at;
    assert.equal(after.sales, before.sales);
    assert.ok(after.other);
    assert.equal(after.all, undefined);
    // Manager movement takes effect immediately and does not follow their own membership.
    await save(3, {
      ...data,
      groups: moved,
      teams: teams.map((t) =>
        t.id === "west" ? { ...t, managerId: undefined } : t,
      ),
    });
    assert.deepEqual(
      (await snapshot(manager)).users.map((u: any) => u.id),
      [manager],
    );
    // Closed registration can claim only a pre-registered, verified identity (verification is server-side).
    await pg.exec(
      "update public.fb_config set settings=jsonb_set(settings,'{registration}','\"closed\"')",
    );
    const pending = {
      email: "pending@example.test",
      name: "Pending",
      role: "learner",
      groups: ["sales"],
      teamId: "child",
    };
    await save(4, pending, admin, "pending");
    const newId = crypto.randomUUID();
    await pg.query("insert into auth.users values($1)", [newId]);
    const register = (email: string) =>
      pg.query<any>(
        "select * from public.fb_register_profile($1,$2,'Google name',false)",
        [newId, email],
      );
    await assert.rejects(
      register("unknown@example.test"),
      /registration is closed/,
    );
    const registered = (await register(pending.email)).rows[0];
    assert.equal(registered.name, "Pending");
    assert.deepEqual(registered.groups, ["sales"]);
    assert.equal((await snapshot(admin)).pending.length, 0);
    // SQL assignment guard rejects unknown groups and ignores client-provided timestamps.
    const courseId = crypto.randomUUID();
    const course: any = {
      id: courseId,
      kind: "course",
      title: "Course",
      status: "published",
      version: 1,
      groups: ["sales"],
      lessons: [],
      questions: [],
      assignments: [
        {
          groupId: "sales",
          assignedAt: "1990-01-01T00:00:00Z",
          due: { type: "days", days: 5 },
        },
      ],
    };
    const doc = (expected: number, c: any, publish = true) =>
      pg.query<any>(
        "select * from public.fb_save_document($1,$2,$3,$4,false,$5,'test')",
        [courseId, expected, JSON.stringify(c), publish, admin],
      );
    let saved = (await doc(0, course)).rows[0];
    assert.notEqual(
      saved.published.assignments[0].assignedAt,
      course.assignments[0].assignedAt,
    );
    const publishedAt = saved.published.assignments[0].assignedAt;
    saved = (await doc(1, { ...course, title: "Draft only" }, false)).rows[0];
    assert.equal(saved.published.title, "Course");
    assert.equal(saved.published.assignments[0].assignedAt, publishedAt);
    await assert.rejects(
      doc(2, {
        ...course,
        assignments: [{ ...course.assignments[0], groupId: "missing" }],
      }),
      /group does not exist/,
    );
    await pg.query("select public.fb_record_progress($1,$2,1,'[]',true,null)", [
      learner,
      courseId,
    ]);
    await pg.query("select public.fb_record_progress($1,$2,1,'[]',true,null)", [
      outsider,
      courseId,
    ]);
    assert.equal((await snapshot(manager)).progress.length, 0);
    assert.equal((await snapshot(learner)).progress.length, 1);
    await pg.query("update public.fb_profiles set active=false where id=$1", [
      learner,
    ]);
    assert.equal((await snapshot(learner)).users.length, 0);
    // No browser role can call privileged RPCs or read pending identities.
    await pg.exec("set role authenticated");
    await assert.rejects(snapshot(admin), /permission denied/);
    await assert.rejects(
      pg.query("select * from public.fb_pending_profiles"),
      /permission denied/,
    );
    await assert.rejects(save(6, data), /permission denied/);
    await pg.exec("reset role");
    const audit = await pg.query<any>(
      "select count(*)::int as n from public.fb_audit where action like 'governance_%'",
    );
    assert.equal(audit.rows[0].n, 4);
  } finally {
    await pg.close();
  }
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
