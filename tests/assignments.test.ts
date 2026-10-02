import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { assignedCourses } from "../lib/types";
import {
  learningState,
  learningTarget,
  onboardingTarget,
  requiredSequence,
} from "../lib/learning";
import { freshWorkspace } from "../lib/store";
import { defaultSettings } from "../lib/settings";
const admin = "00000000-0000-4000-8000-000000000001",
  learner = "00000000-0000-4000-8000-000000000002",
  cid = "00000000-0000-4000-8000-000000000003";
test("group requirements and person progress administration are atomic, versioned, isolated and audited", async () => {
  const pg = new PGlite();
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
    for (const id of [admin, learner]) {
      await pg.query("insert into auth.users values($1)", [id]);
      await pg.query(
        "insert into public.fb_profiles(id,name,email,role) values($1,$2,$3,$4)",
        [id, id, id + "@example.test", id === admin ? "admin" : "learner"],
      );
    }
    await pg.exec(
      `update public.fb_config set groups='[{"id":"sales","name":"Sales"},{"id":"solutions","name":"Solutions"}]'`,
    );
    const course = {
      id: cid,
      kind: "course",
      title: "Published",
      version: 1,
      status: "published",
      groups: ["sales"],
      lessons: [{ id: "lesson", title: "Lesson", body: "Test" }],
      questions: [],
      assignments: [
        {
          groupId: "sales",
          due: { type: "none" },
          assignedAt: "2000-01-01T00:00:00Z",
        },
      ],
    };
    await pg.query(
      "select public.fb_save_document($1,0,$2,true,false,$3,'test')",
      [cid, JSON.stringify(course), admin],
    );
    await pg.query(
      "select public.fb_save_document($1,1,$2,false,false,$3,'test')",
      [cid, JSON.stringify({ ...course, title: "Unpublished edits" }), admin],
    );
    const manage = (operation: string, extra: any = {}, actor = admin) =>
      pg.query("select public.fb_manage_learning($1,$2)", [
        actor,
        JSON.stringify({
          operation,
          contentId: cid,
          expected: 2,
          ...(operation === "assign" || operation === "unassign"
            ? { groupId: "solutions" }
            : { userId: learner }),
          ...extra,
        }),
      ]);
    await assert.rejects(
      manage("assign", { due: { type: "none" } }, learner),
      /Administrator/,
    );
    await assert.rejects(
      manage("assign", { groupId: undefined, userId: learner }),
      /belongs to a group/,
    );
    await assert.rejects(
      manage("unassign", { groupId: undefined, userId: learner }),
      /belongs to a group/,
    );
    for (const assignments of [
      [{ userId: learner, due: { type: "none" } }],
      [{ groupId: "sales", due: { type: "days", days: 3 } }],
      [{ groupId: "sales", due: { type: "date", date: "2026-09-22" } }],
    ]) {
      await assert.rejects(
        pg.query(
          "select public.fb_save_document($1,2,$2,true,false,$3,'test')",
          [cid, JSON.stringify({ ...course, assignments }), admin],
        ),
        /groups and workspace windows/,
      );
    }
    await manage("assign", { due: { type: "none" } });
    const getDoc = async () =>
      (
        await pg.query<any>("select * from public.fb_documents where id=$1", [
          cid,
        ])
      ).rows[0];
    let d = await getDoc();
    assert.equal(d.published.title, "Published");
    assert.equal(d.draft.title, "Unpublished edits");
    assert.equal(d.published.assignments.length, 2);
    assert.equal(d.published.assignments[0].groupId, "sales");
    assert(
      d.published.assignments.every(
        (rule: any) => rule.groupId && !rule.userId && rule.due.type === "none",
      ),
    );
    await assert.rejects(manage("unassign"), /changed/);
    const getProgress = async () =>
      (
        await pg.query<any>(
          "select * from public.fb_progress where user_id=$1",
          [learner],
        )
      ).rows[0];
    await manage("complete", { expected: 3, version: 1, progressExpected: 0 });
    let p = await getProgress();
    assert.equal(p.passed, true);
    assert.deepEqual(p.lessons, ["lesson"]);
    assert.equal(p.revision, 1);
    await assert.rejects(
      manage("reset", { expected: 3, version: 1, progressExpected: 0 }),
      /Progress changed/,
    );
    await assert.rejects(
      manage("reset", { expected: 3, version: 2, progressExpected: 1 }),
      /version changed/,
    );
    await manage("reset", { expected: 3, version: 1, progressExpected: 1 });
    p = await getProgress();
    assert.equal(p.passed, false);
    assert.deepEqual(p.lessons, []);
    assert.equal(p.revision, 2);
    await manage("unassign", { expected: 3 });
    d = await getDoc();
    assert.equal(d.published.assignments.length, 1);
    assert.equal(d.published.assignments[0].groupId, "sales");
    assert(
      d.published.assignments.every(
        (rule: any) => rule.groupId && !rule.userId && rule.due.type === "none",
      ),
    );
    assert.equal((await getProgress()).revision, 2);
    await pg.query(
      "select public.fb_record_progress($1,$2,1,'[\"lesson\"]',true,null)",
      [learner, cid],
    );
    assert.equal((await getProgress()).revision, 3);
    assert.equal(
      (
        await pg.query<any>(
          "select count(*)::int n from public.fb_audit where action in ('progress_reset','progress_complete')",
        )
      ).rows[0].n,
      2,
    );
    await pg.exec("set role authenticated");
    await assert.rejects(
      manage("complete", { expected: 4, version: 1, progressExpected: 3 }),
      /permission denied/,
    );
    await pg.exec("reset role");
  } finally {
    await pg.close();
  }
});
test("overlapping independent group requirements count once; individual rules do not require courses", () => {
  const data = freshWorkspace();
  const user = {
    ...data.users[0],
    hireDate: undefined,
    onboardingStart: undefined,
    groups: ["sales", "startup"],
    groupJoinedAt: {
      sales: "2026-09-20T00:00:00Z",
      startup: "2026-09-20T00:00:00Z",
    },
  };
  const groups = [
    { id: "sales", name: "Sales" },
    { id: "startup", name: "Startup" },
  ];
  const course = {
    ...data.content.find((c) => c.kind === "course")!,
    assignments: [
      {
        groupId: "sales",
        assignedAt: "2026-09-01T00:00:00Z",
        due: { type: "none" as const },
      },
      {
        groupId: "startup",
        assignedAt: "2026-09-25T00:00:00Z",
        due: { type: "none" as const },
      },
      // Historical data must not revive retired individual requirements.
      {
        userId: user.id,
        assignedAt: "2026-09-01T00:00:00Z",
        due: { type: "date" as const, date: "2026-09-22" },
      },
    ],
  };
  assert.equal(assignedCourses([course], user, groups).length, 1);
  assert.deepEqual(
    requiredSequence([course], user, groups).map((c) => c.id),
    [course.id],
  );
  assert.equal(learningTarget(course, user, groups), "2026-10-20");
  assert.equal(
    assignedCourses([course], { ...user, groups: [] }, groups).length,
    0,
  );
  assert.equal(
    learningTarget(course, { ...user, groups: [] }, groups),
    undefined,
  );
});

test("completion targets preserve the applied onboarding window and use the later catch-up window", () => {
  const data = freshWorkspace();
  const user = {
    ...data.users[0],
    hireDate: undefined,
    onboardingDays: 90,
    onboardingStart: "2026-09-01",
    groups: ["sales"],
    groupJoinedAt: { sales: "2026-09-20T00:00:00Z" },
  };
  const course = {
    ...data.content.find((c) => c.kind === "course")!,
    assignments: [
      {
        groupId: "sales",
        assignedAt: "2026-09-01T00:00:00Z",
        due: { type: "none" as const },
      },
    ],
  };
  assert.equal(learningTarget(course, user, data.groups), "2026-11-30");
  const existingUser = { ...user, onboardingStart: undefined };
  assert.equal(learningTarget(course, existingUser, data.groups), "2026-10-20");
  assert.equal(
    learningTarget(course, existingUser, data.groups, {
      ...defaultSettings,
      catchUpDays: 14,
    }),
    "2026-10-04",
  );
  assert.equal(
    learningTarget(course, user, data.groups, {
      ...defaultSettings,
      onboardingDays: 30,
    }),
    "2026-11-30",
  );
  const newlyRequired = {
    ...course,
    assignments: [
      { ...course.assignments[0], assignedAt: "2026-11-20T00:00:00Z" },
    ],
  };
  assert.equal(learningTarget(newlyRequired, user, data.groups), "2026-12-20");
  const withoutDueDates = { ...defaultSettings, dueDatesEnabled: false };
  assert.equal(
    learningTarget(course, user, data.groups, withoutDueDates),
    undefined,
  );
  assert.equal(onboardingTarget(user, withoutDueDates), undefined);
  const state = learningState(
    [course],
    existingUser,
    data.groups,
    [],
    withoutDueDates,
  );
  assert.equal(state.required.length, 1);
  assert.equal(state.remaining.length, 1);
  assert.deepEqual(state.overdue, []);
  assert.equal(state.status, "In progress");
});
