import { teamProgressRows, teamProgressCsv } from "../lib/reporting";
import { serializeCsv } from "../lib/csv";
import type { Workspace } from "../lib/store";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { freshWorkspace } from "../lib/store";
import { assignedCourses, effectiveGroups, isComplete } from "../lib/types";
import {
  groupItems,
  reconcileLearning,
  updatesForUser,
} from "../lib/learning-groups";
import {
  completionPercent,
  requiredSequence,
  learningTarget,
} from "../lib/learning";
import { governanceSchema } from "../server/governance-schema";

test("demo learning groups combine live teams, curriculum order and direct assignments without duplicate progress", () => {
  const original = freshWorkspace();
  const next = structuredClone(original);
  const courses = original.content.filter(
    (c) => c.kind === "course" && c.groups.includes("sales"),
  );
  const [a, b, c] = courses;
  next.curricula = [
    {
      id: "start",
      name: "Getting started",
      description: "",
      status: "published",
      courseIds: [b.id, a.id],
    },
  ];
  next.groups = [
    {
      id: "all",
      name: "Everyone",
      teamIds: ["sales-team"],
      learningItems: [{ kind: "course", id: a.id }],
    },
    {
      id: "sales",
      name: "Sales",
      teamIds: ["sales-team"],
      learningItems: [
        { kind: "curriculum", id: "start" },
        { kind: "course", id: c.id },
      ],
    },
  ];
  next.users[0].groups = [];
  const saved = reconcileLearning(original, next, "2026-09-20T00:00:00.000Z");
  const user = saved.users[0];
  assert.deepEqual([...effectiveGroups(user, saved.groups)], ["all", "sales"]);
  assert.deepEqual(
    requiredSequence(saved.content, user, saved.groups).map((c) => c.id),
    [a.id, b.id, c.id],
  );
  assert.equal(assignedCourses(saved.content, user, saved.groups).length, 3);
  assert.equal(
    isComplete(
      saved.content.find((x) => x.id === a.id)!,
      saved.progress[user.id],
    ),
    true,
  );
  const leave = structuredClone(saved);
  leave.users[0].teamId = undefined;
  const left = reconcileLearning(saved, leave, "2026-10-01T00:00:00.000Z");
  assert.equal(
    assignedCourses(left.content, left.users[0], left.groups).length,
    0,
  );
  assert.deepEqual(left.progress, saved.progress);
  assert.equal(left.content.length, original.content.length);
  const rejoin = structuredClone(left);
  rejoin.users[0].teamId = "sales-team";
  assert.equal(
    reconcileLearning(left, rejoin, "2026-10-02T00:00:00.000Z").users[0]
      .effectiveGroupJoinedAt?.sales,
    "2026-10-02T00:00:00.000Z",
  );
  const reordered = structuredClone(saved);
  reordered.curricula![0].courseIds.reverse();
  const result = reconcileLearning(
    saved,
    reordered,
    "2026-10-03T00:00:00.000Z",
  );
  assert.equal(
    learningTarget(
      saved.content.find((x) => x.id === a.id)!,
      user,
      saved.groups,
    ),
    learningTarget(
      result.content.find((x) => x.id === a.id)!,
      result.users[0],
      result.groups,
    ),
  );
  assert.deepEqual(
    groupItems({ id: "sales", name: "Sales" }, original.content).map(
      (i) => i.id,
    ),
    courses.sort((a, b) => a.title.localeCompare(b.title)).map((c) => c.id),
  );
});

test("Updates split once into relevant and other updates, independent of learning progress", () => {
  const data = freshWorkspace();
  const base = data.content.find((c) => c.kind === "brief")!;
  const content = [
    { ...base, id: "old", groups: ["parent"], updatedAt: "2026-09-01" },
    { ...base, id: "new", groups: ["sales"], updatedAt: "2026-09-20" },
    { ...base, id: "other", groups: [], updatedAt: "2026-09-21" },
    { ...base, id: "draft", status: "draft" as const, groups: ["sales"] },
  ];
  const result = updatesForUser(
    content,
    { ...data.users[0], groups: ["sales", "parent"] },
    [
      { id: "parent", name: "Everyone" },
      { id: "sales", name: "Sales" },
    ],
  );
  assert.deepEqual(
    result.forYou.map((c) => c.id),
    ["new", "old"],
  );
  assert.deepEqual(
    result.other.map((c) => c.id),
    ["other"],
  );
  const guest = updatesForUser(
    content,
    { ...data.users[0], groups: [], teamId: undefined },
    data.groups,
  );
  assert.equal(guest.forYou.length, 0);
  assert.equal(guest.other.length, 3);
});

test("Update recommendations feature at most two recent audience matches and retain every other published update", () => {
  const data = freshWorkspace();
  const base = data.content.find((c) => c.kind === "brief")!;
  const many = Array.from({ length: 24 }, (_, index) => ({
    ...base,
    id: `update-${String(index).padStart(2, "0")}`,
    groups: index === 23 ? ["parent"] : index % 3 === 0 ? ["sales"] : [],
    updatedAt: `2026-09-${String(23 - index).padStart(2, "0")}T12:00:00.000Z`,
  }));
  const result = updatesForUser(many, data.users[0], [
    { id: "parent", name: "Everyone" },
    { id: "sales", name: "Sales" },
  ]);
  assert.deepEqual(
    result.forYou.map((item) => item.id),
    ["update-00", "update-03"],
  );
  assert.equal(result.other.length, 22);
  assert.ok(result.other.some((item) => item.id === "update-23"));
  assert.equal(
    new Set([...result.forYou, ...result.other].map((item) => item.id)).size,
    24,
  );
  assert.deepEqual(
    [...result.other].map((item) => item.id),
    many
      .filter((item) => item.id !== "update-00" && item.id !== "update-03")
      .map((item) => item.id),
  );
});

test("Update feed handles zero, one, two, draft-only edits, duplicate IDs and invalid dates deterministically", () => {
  const data = freshWorkspace();
  const base = data.content.find((c) => c.kind === "brief")!;
  const group = [{ id: "sales", name: "Sales" }];
  const make = (id: string, patch: Partial<typeof base> = {}) => ({
    ...base,
    id,
    groups: ["sales"],
    ...patch,
  });
  for (const count of [0, 1, 2]) {
    const result = updatesForUser(
      Array.from({ length: count }, (_, i) => make(`item-${i}`)),
      data.users[0],
      group,
    );
    assert.equal(result.forYou.length, count);
    assert.equal(result.other.length, 0);
  }

  const result = updatesForUser(
    [
      make("valid", { updatedAt: "2026-09-20T00:00:00.000Z" }),
      make("created-fallback", {
        updatedAt: "invalid",
        createdAt: "2026-09-21T00:00:00.000Z",
      }),
      make("undated-b", { updatedAt: "invalid", createdAt: undefined }),
      make("undated-a", { updatedAt: "", createdAt: undefined }),
      make("draft", {
        status: "draft",
        updatedAt: "2026-09-30T00:00:00.000Z",
      }),
      make("valid", { updatedAt: "2026-09-01T00:00:00.000Z" }),
    ],
    data.users[0],
    group,
  );
  assert.deepEqual(
    result.forYou.map((item) => item.id),
    ["created-fallback", "valid"],
  );
  assert.deepEqual(
    result.other.map((item) => item.id),
    ["undated-a", "undated-b"],
  );
});

test("learning governance rejects bad team links, duplicate items and unpublished curricula", () => {
  const cid = "00000000-0000-4000-8000-000000000010";
  const input = {
    expected: 1,
    users: [],
    teams: [{ id: "t", name: "Team" }],
    groups: [
      {
        id: "g",
        name: "Group",
        teamIds: ["t"],
        learningItems: [{ kind: "curriculum", id: "c" }],
      },
    ],
    curricula: [
      {
        id: "c",
        name: "Curriculum",
        description: "",
        status: "published",
        courseIds: [cid],
      },
    ],
  };
  assert.equal(governanceSchema.safeParse(input).success, true);
  for (const bad of [
    { ...input, groups: [{ ...input.groups[0], parentId: "g" }] },
    { ...input, groups: [{ ...input.groups[0], teamLinkScope: "direct" }] },
    { ...input, groups: [{ ...input.groups[0], legacyDirectTeamIds: ["t"] }] },
    {
      ...input,
      groups: [{ ...input.groups[0], legacyDirectTeamIds: ["missing"] }],
    },
    { ...input, teams: [] },
    { ...input, curricula: [{ ...input.curricula[0], status: "draft" }] },
    { ...input, curricula: [{ ...input.curricula[0], courseIds: [cid, cid] }] },
    {
      ...input,
      groups: [
        {
          ...input.groups[0],
          learningItems: [
            ...input.groups[0].learningItems,
            ...input.groups[0].learningItems,
          ],
        },
      ],
    },
  ])
    assert.equal(governanceSchema.safeParse(bad).success, false);
});

test("learning-groups migration preserves history and enforces atomic, scoped team/curriculum/update changes", async () => {
  const pg = new PGlite();
  const admin = "00000000-0000-4000-8000-000000000001",
    learner = "00000000-0000-4000-8000-000000000002",
    outsider = "00000000-0000-4000-8000-000000000003",
    manager = "00000000-0000-4000-8000-000000000004";
  const a = "00000000-0000-4000-8000-000000000010",
    b = "00000000-0000-4000-8000-000000000011",
    update = "00000000-0000-4000-8000-000000000012";
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
    ])
      await pg.exec(
        await readFile(
          new URL("../supabase/migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
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
        id: learner,
        name: "Learner",
        email: "learner@example.test",
        role: "learner",
        active: true,
        groups: ["sales"],
        teamId: "sales-team",
      },
      {
        id: outsider,
        name: "Other",
        email: "other@example.test",
        role: "learner",
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
      },
    ];
    for (const u of users) {
      await pg.query("insert into auth.users values($1)", [u.id]);
      await pg.query(
        "insert into public.fb_profiles(id,name,email,role,groups,team_id) values($1,$2,$3,$4,$5,$6)",
        [
          u.id,
          u.name,
          u.email,
          u.role,
          JSON.stringify(u.groups),
          u.teamId || null,
        ],
      );
    }
    await pg.exec(
      `update public.fb_config set groups='[{"id":"sales","name":"Sales","requiredCourseIds":["${a}"]}]',teams='[{"id":"sales-team","name":"Sales team","managerId":"${manager}"}]'`,
    );
    const course = (id: string) => ({
      id,
      kind: "course",
      title: id === a ? "Foundations" : "Advanced",
      version: 1,
      status: "published",
      groups: id === a ? ["sales"] : [],
      lessons: [{ id: "lesson", title: "Lesson", body: "Test" }],
      questions: [],
    });
    for (const id of [a, b])
      await pg.query(
        "select public.fb_save_document($1,0,$2,true,false,$3,'test')",
        [id, JSON.stringify(course(id)), admin],
      );
    await pg.query(
      "select public.fb_save_document($1,1,$2,false,false,$3,'test')",
      [a, JSON.stringify({ ...course(a), title: "Unpublished edit" }), admin],
    );
    await pg.query(
      "select public.fb_save_document($1,0,$2,true,false,$3,'test')",
      [
        update,
        JSON.stringify({
          id: update,
          kind: "brief",
          title: "Update",
          version: 1,
          groups: [],
          lessons: [],
          questions: [],
        }),
        admin,
      ],
    );
    await pg.query(
      "insert into public.fb_progress(user_id,content_id,version,lessons,passed) values($1,$2,1,'[\"lesson\"]',true)",
      [learner, a],
    );
    const row = async (id: string) =>
      (
        await pg.query<any>("select * from public.fb_documents where id=$1", [
          id,
        ])
      ).rows[0];
    const config = async () =>
      (await pg.query<any>("select * from public.fb_config")).rows[0];
    const before = await row(a);
    const progressBefore = (await pg.query("select * from public.fb_progress"))
      .rows;
    await pg.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202609200004_learning_groups.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const migrated = await config();
    assert.deepEqual(migrated.groups[0].learningItems, [
      { kind: "course", id: a },
    ]);
    assert.deepEqual(
      (await row(a)).published.assignments,
      before.published.assignments,
    );
    assert.equal((await row(a)).draft.title, "Unpublished edit");
    assert.deepEqual(
      (await pg.query("select * from public.fb_progress")).rows,
      progressBefore,
    );
    const save = async (patch: any = {}, actor = admin, expected?: number) => {
      const cfg = await config();
      return pg.query("select public.fb_save_governance($1,$2,'save',$3)", [
        actor,
        expected ?? cfg.governance_revision,
        JSON.stringify({
          users,
          groups: cfg.groups,
          teams: cfg.teams,
          curricula: cfg.curricula,
          ...patch,
        }),
      ]);
    };
    const curricula = [
      {
        id: "onboarding",
        name: "Onboarding",
        description: "Start here",
        status: "published",
        courseIds: [b, a],
      },
    ];
    let groups = [
      {
        ...migrated.groups[0],
        teamIds: ["sales-team"],
        learningItems: [
          { kind: "curriculum", id: "onboarding" },
          { kind: "course", id: a },
        ],
      },
    ];
    await assert.rejects(save({ groups, curricula }, learner), /Administrator/);
    await save({ groups, curricula });
    assert.deepEqual((await config()).groups[0].requiredCourseIds, [b, a]);
    assert.equal(
      (await row(a)).published.assignments[0].assignedAt,
      before.published.assignments[0].assignedAt,
    );
    const bstamp = (await row(b)).published.assignments[0].assignedAt;
    const snap = async (id: string) =>
      (
        await pg.query<any>("select public.fb_governance_snapshot($1) as s", [
          id,
        ])
      ).rows[0].s;
    assert.deepEqual((await snap(outsider)).groups, []);
    assert.deepEqual(
      (await snap(manager)).users.map((u: any) => u.id).sort(),
      [learner, manager].sort(),
    );
    // CSV consumes the real SQL scope, including a JSON response larger than
    // the usual Data API row cap; it never fetches people independently.
    const reportWorkspace = async (actor: string): Promise<Workspace> => {
      const scoped = await snap(actor);
      return {
        schema: 1,
        groups: scoped.groups,
        teams: scoped.teams,
        content: [(await row(a)).published, (await row(b)).published],
        users: scoped.users.map((u: any) => ({
          ...u,
          teamId: u.team_id,
          onboardingStart: u.onboarding_start,
          effectiveGroupJoinedAt: u.effective_group_joined_at,
        })),
        progress: Object.fromEntries(
          scoped.users.map((u: any) => [
            u.id,
            scoped.progress.filter((p: any) => p.user_id === u.id),
          ]),
        ),
      };
    };
    let reportData = await reportWorkspace(manager);
    const reportActor = reportData.users.find((u) => u.id === manager)!;
    const csv = teamProgressCsv(teamProgressRows(reportData, reportActor));
    assert.equal(csv.rows.length, 1);
    assert.equal(csv.rows[0][0], "Learner");
    assert.ok(!serializeCsv(csv).includes("other@example.test"));
    const learnerData = await reportWorkspace(learner);
    assert.equal(teamProgressRows(learnerData, learnerData.users[0]).length, 0);
    await pg.exec("begin");
    await pg.exec(`insert into auth.users select ('00000000-0000-4000-8001-' || lpad(i::text,12,'0'))::uuid from generate_series(1,1505) i;
      insert into public.fb_profiles(id,name,email,role,team_id) select id,'Large person ' || id::text,id::text || '@example.test','learner','sales-team' from auth.users where id::text like '00000000-0000-4000-8001-%';`);
    reportData = await reportWorkspace(manager);
    assert.equal(
      teamProgressCsv(teamProgressRows(reportData, reportActor)).rows.length,
      1506,
    );
    await pg.exec("rollback");
    users[1].groups = [];
    await save();
    assert.equal((await snap(learner)).groups[0].id, "sales");
    const joined = (await snap(learner)).users[0].effective_group_joined_at
      .sales;
    curricula[0].courseIds = [a, b];
    await save({ curricula });
    assert.equal((await row(b)).published.assignments[0].assignedAt, bstamp);
    assert.equal(
      (await snap(learner)).users[0].effective_group_joined_at.sales,
      joined,
    );
    // Remove playlist while a direct assignment remains: no loss of the continuing course.
    groups = [{ ...groups[0], learningItems: [{ kind: "course", id: a }] }];
    await save({ groups });
    assert.equal(
      (await row(a)).published.assignments[0].assignedAt,
      before.published.assignments[0].assignedAt,
    );
    assert.deepEqual((await row(b)).published.assignments, []);
    const action = async (
      operation: string,
      actor = admin,
      expected?: number,
    ) =>
      pg.query("select public.fb_manage_learning($1,$2)", [
        actor,
        JSON.stringify({
          operation,
          contentId: update,
          groupId: "sales",
          expected: expected ?? (await row(update)).revision,
        }),
      ]);
    await assert.rejects(action("target", learner), /Administrator/);
    await action("target");
    assert.deepEqual((await row(update)).published.groups, ["sales"]);
    assert.deepEqual((await row(update)).published.assignments, []);
    await assert.rejects(action("untarget", admin, 1), /changed/);
    const version = (await config()).governance_revision;
    await save();
    await assert.rejects(save({}, admin, version), /Revision conflict/);
    await assert.rejects(
      save({ groups: [{ ...groups[0], teamIds: ["missing"] }] }),
      /Team does not exist/,
    );
    await assert.rejects(
      save({
        groups: [
          {
            ...groups[0],
            learningItems: [{ kind: "curriculum", id: "missing" }],
          },
        ],
      }),
      /published curriculum/,
    );
    assert.deepEqual((await row(a)).draft.title, "Unpublished edit");
    // Registration resolves live team links, even with no individual membership.
    await pg.query("select public.fb_save_governance($1,$2,'pending',$3)", [
      admin,
      (await config()).governance_revision,
      JSON.stringify({
        email: "new@example.test",
        name: "New",
        role: "learner",
        groups: [],
        teamId: "sales-team",
      }),
    ]);
    const newcomer = "00000000-0000-4000-8000-000000000009";
    await pg.query("insert into auth.users values($1)", [newcomer]);
    await pg.query(
      "select public.fb_register_profile($1,'new@example.test','New',false)",
      [newcomer],
    );
    assert.ok((await snap(newcomer)).users[0].effective_group_joined_at.sales);
    users.push({
      id: newcomer,
      name: "New",
      email: "new@example.test",
      role: "learner",
      active: true,
      groups: [],
      teamId: "sales-team",
    });
    users[1].teamId = undefined;
    await save();
    assert.deepEqual((await snap(learner)).groups, []);
    users[1].groups = ["sales"];
    await save();
    assert.equal((await snap(learner)).groups[0].id, "sales");
    const currentA = await row(a);
    await pg.query(
      "select public.fb_save_document($1,$2,$3,true,false,$4,'test')",
      [
        a,
        currentA.revision,
        JSON.stringify({ ...currentA.draft, version: 2 }),
        admin,
      ],
    );
    assert.equal((await row(a)).published.version, 2);
    assert.notEqual(
      (await row(a)).published.assignments[0].assignedAt,
      before.published.assignments[0].assignedAt,
    );
    assert.deepEqual(
      (await pg.query("select * from public.fb_progress")).rows,
      progressBefore,
    );
    // Deletion removes source links and tags, not content or learner history.
    users[1].groups = [];
    await save({ groups: [] });
    assert.deepEqual((await row(update)).published.groups, []);
    assert.deepEqual((await row(a)).published.assignments, []);
    assert.deepEqual(
      (await pg.query("select * from public.fb_progress")).rows,
      progressBefore,
    );
    assert.equal(
      (await pg.query("select * from public.fb_documents")).rows.length,
      3,
    );
    // An optional guest selection never enrolls a newly registered account.
    await save({
      groups: [
        { id: "visitors", name: "Visitors", learningItems: [], teamIds: [] },
      ],
    });
    await pg.exec(
      `update public.fb_config set settings=settings || '{"access":"public","registration":"open","guestGroupId":"visitors"}'::jsonb`,
    );
    const registrant = "00000000-0000-4000-8000-000000000099";
    await pg.query("insert into auth.users values($1)", [registrant]);
    const profilesBefore = (await pg.query("select id from public.fb_profiles"))
      .rows.length;
    await pg.query(
      "select public.fb_register_profile($1,'registrant@example.test','Registrant',false)",
      [registrant],
    );
    const registered = await pg.query<any>(
      "select groups,team_id,effective_group_joined_at from public.fb_profiles where id=$1",
      [registrant],
    );
    assert.deepEqual(registered.rows[0].groups, []);
    assert.deepEqual(registered.rows[0].effective_group_joined_at, {});
    assert.equal(registered.rows[0].team_id, null);
    assert.equal(
      (await pg.query("select id from public.fb_profiles")).rows.length,
      profilesBefore + 1,
    );
    assert.deepEqual(
      (await pg.query("select * from public.fb_progress")).rows,
      progressBefore,
    );
    const permissions = await pg.query<any>(
      "select has_function_privilege('authenticated','public.fb_save_governance(uuid,integer,text,jsonb)','execute') as allowed",
    );
    assert.equal(permissions.rows[0].allowed, false);
  } finally {
    await pg.close();
  }
});

test("100 percent means every designated course is complete", () => {
  assert.equal(completionPercent(199, 200), 99);
  assert.equal(completionPercent(200, 200), 100);
  assert.equal(completionPercent(6, 8), 75);
  assert.equal(completionPercent(0, 0), 0);
});
