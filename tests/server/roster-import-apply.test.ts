import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { serializeCsv } from "../../lib/csv";
import {
  ROSTER_IMPORT_MAX_ROWS,
  rosterTemplate,
} from "../../lib/roster-import";
import type { User } from "../../lib/types";
import { profile } from "../../server/auth";
import type { DataStore } from "../../server/ports/data";
import {
  applyRosterImport,
  readRosterApply,
  reviewRosterImport,
} from "../../server/roster-import";
import { rosterDatabase, saveRoster, value } from "../helpers/roster-database";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin: User = {
  id: id(1),
  name: "Admin",
  email: "admin@example.test",
  role: "admin",
  active: true,
  groups: [],
};
const csv = (rows: string[][]) => serializeCsv({ ...rosterTemplate(), rows });
async function database() {
  const pg = await rosterDatabase();
  // Represent existing people whose creation dates were never recorded.
  // The current trigger owns dates for every subsequent insert and update.
  await pg.exec(
    `alter table fb_profiles disable trigger fb_profile_added_at;
    insert into auth.users values('${id(1)}'),('${id(2)}'); insert into fb_profiles(id,auth_user_id,email,name,role) values('${id(1)}','${id(1)}','admin@example.test','Admin','admin'),('${id(2)}','${id(2)}','learner@example.test','Learner','learner');
    alter table fb_profiles enable trigger fb_profile_added_at;`,
  );
  const store = {
    readConfiguration: () =>
      value(pg, "select to_jsonb(c) value from fb_config c where id"),
    readAdminPeopleSnapshot: (actor: string) =>
      value(pg, "select fb_admin_people_snapshot($1) value", [actor]),
    listDeletedRosterProfiles: async () =>
      (
        await pg.query<{
          id: string;
          email: string | null;
          purge_after: string;
          purging: boolean;
          auth_locked: boolean;
        }>(
          "select id,email,purge_after,purging,auth_locked from fb_deleted_items where entity='user'",
        )
      ).rows.map((row) => ({
        ...row,
        purge_after: new Date(row.purge_after).toISOString(),
      })),
    listProfiles: async () =>
      (
        await pg.query<Record<string, unknown>>(
          "select * from fb_profiles order by id",
        )
      ).rows.map((row) => ({
        ...row,
        hire_date:
          row.hire_date instanceof Date
            ? row.hire_date.toISOString().slice(0, 10)
            : row.hire_date,
        onboarding_start:
          row.onboarding_start instanceof Date
            ? row.onboarding_start.toISOString().slice(0, 10)
            : row.onboarding_start,
        added_at:
          row.added_at instanceof Date
            ? row.added_at.toISOString()
            : row.added_at,
      })),
    listPublishedAssignmentContent: async () =>
      (
        await pg.query(
          "select * from fb_documents where published is not null and deleted_at is null order by id",
        )
      ).rows,
    rosterImportOperation: async (
      actor: string,
      hash: string,
      run?: string,
      payload?: unknown,
    ) =>
      value(pg, "select fb_roster_import($1,$2,$3,$4) value", [
        actor,
        hash,
        run || null,
        payload ? JSON.stringify(payload) : null,
      ]),
  } as unknown as DataStore;
  return { pg, store };
}
async function unchangedData(pg: Awaited<ReturnType<typeof rosterDatabase>>) {
  const tables = (
    await pg.query<{ name: string }>(
      "select tablename name from pg_tables where schemaname='public' and tablename<>'fb_roster_import_runs' order by tablename",
    )
  ).rows;
  return Object.fromEntries(
    await Promise.all(
      tables.map(async ({ name }) => [
        name,
        await value(
          pg,
          `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') value from public.${name} t`,
        ),
      ]),
    ),
  );
}
test("roster creation dates are database-owned across preregistration, edits, CSV and first sign-in", async () => {
  const { pg, store } = await database();
  try {
    const snapshot = await store.readAdminPeopleSnapshot(admin.id);
    await pg.query("select fb_save_governance($1,$2,'pending',$3)", [
      admin.id,
      snapshot.revision,
      JSON.stringify({
        name: "Pending",
        email: "pending@example.test",
        role: "learner",
        groups: [],
        hireDate: "2020-01-01",
        addedAt: "1900-01-01T00:00:00.000Z",
      }),
    ]);
    const pending = (await store.listProfiles()).find(
      (p) => p.email === "pending@example.test",
    )!;
    assert.ok(pending.added_at);
    assert.ok(Date.parse(pending.added_at!) > Date.parse("2020-01-01"));
    assert.equal(profile(pending).addedAt, pending.added_at);
    assert.equal(
      Date.parse(
        (await store.readAdminPeopleSnapshot(admin.id)).users.find(
          (p) => p.id === pending.id,
        )!.added_at!,
      ),
      new Date(pending.added_at!).getTime(),
    );
    await pg.query(
      "update fb_profiles set added_at='2099-01-01', name='Edited' where id=$1",
      [pending.id],
    );
    await saveRoster(pg, admin.id, (data) => {
      data.users.find((p: any) => p.id === pending.id).hireDate = "2021-02-03";
    });
    const input = csv([
      ["CSV rename", "pending@example.test", "2022-03-04", "", "", ""],
    ]);
    const review = await reviewRosterImport(admin, input, store);
    await applyRosterImport(admin, input, review.token!, store);
    assert.equal(
      (await store.listProfiles()).find((p) => p.id === pending.id)!.added_at,
      pending.added_at,
    );
    await pg.exec(
      `insert into auth.users values('${id(99)}'),('${id(98)}'); update fb_config set settings=settings||'{"registration":"open"}' where id;`,
    );
    const activated = await value(
      pg,
      "select to_jsonb(fb_register_profile($1,$2,'Login',false)) value",
      [id(99), pending.email],
    );
    assert.equal(
      Date.parse(activated.added_at),
      new Date(pending.added_at!).getTime(),
    );
    const signedUp = await value(
      pg,
      "select to_jsonb(fb_register_profile($1,$2,'New login',true)) value",
      [id(98), "signup@example.test"],
    );
    assert.ok(
      signedUp.added_at,
      "new verified registrations receive a roster creation time",
    );
    await pg.query("update fb_profiles set added_at='2099-01-01' where id=$1", [
      id(2),
    ]);
    assert.equal(
      (await store.listProfiles()).find((p) => p.id === id(2))!.added_at,
      null,
      "editing does not invent a legacy date",
    );
    for (const role of ["anon", "authenticated"])
      assert.equal(
        await value(
          pg,
          "select has_function_privilege($1,'public.fb_profile_added_at()','execute') value",
          [role],
        ),
        false,
      );
  } finally {
    await pg.close();
  }
});
test("atomic real import resolves same-file pending managers, preserves IDs and verified activation, and replays its exact receipt", async () => {
  const { pg, store } = await database();
  try {
    const input = csv([
      [
        "Rep",
        "rep@example.test",
        "2026-09-20",
        "Child",
        "Sales",
        "manager@example.test",
      ],
      [
        "Boss",
        "manager@example.test",
        "",
        "Sales",
        "Organization",
        "manager@example.test",
      ],
      [
        "Learner renamed",
        "learner@example.test",
        "",
        "Child",
        "Sales",
        "manager@example.test",
      ],
    ]);
    const review = await reviewRosterImport(admin, input, store);
    assert.equal(review.valid, true);
    assert.ok(review.token);
    assert.equal(
      (await store.listProfiles()).length,
      2,
      "review does not import people",
    );
    const result = await applyRosterImport(admin, input, review.token!, store);
    assert.equal(result.peopleAdded, 2);
    assert.equal(result.peopleUpdated, 1);
    assert.equal(result.teamsAdded, 2);
    assert.deepEqual(
      await applyRosterImport(admin, input, review.token!, store),
      result,
    );
    const people = await store.listProfiles();
    assert.equal(people.length, 4);
    assert.equal(
      people.find((p) => p.email === "learner@example.test")!.id,
      id(2),
    );
    const manager = people.find((p) => p.email === "manager@example.test")!;
    assert.equal(manager.role, "manager");
    assert.equal((manager as any).auth_user_id, null);
    const cfg = await store.readConfiguration();
    const sales = cfg.teams.find((t) => t.name === "Sales")!,
      child = cfg.teams.find((t) => t.name === "Child")!;
    assert.equal(child.parentId, sales.id);
    assert.equal(sales.managerId, manager.id);
    assert.ok(!JSON.stringify(cfg).includes("csv-preview:"));
    const audit = await value(
      pg,
      "select snapshot value from fb_audit where action='roster_import'",
    );
    assert.deepEqual(audit, result);
    assert.ok(!JSON.stringify(audit).includes("@"));
    await pg.exec(`insert into auth.users values('${id(99)}');`);
    const activated = await value(
      pg,
      "select to_jsonb(fb_register_profile($1,$2,'Login name',false)) value",
      [id(99), manager.email],
    );
    assert.equal(activated.id, manager.id);
    assert.equal(activated.role, "manager");
    assert.ok(manager.added_at);
    assert.equal(
      Date.parse(activated.added_at),
      new Date(manager.added_at!).getTime(),
      "verified activation retains roster creation time",
    );
    const rerun = await reviewRosterImport(admin, input, store);
    assert.equal(rerun.valid, true);
    const noChange = await applyRosterImport(admin, input, rerun.token!, store);
    assert.equal(noChange.peopleAdded, 0);
    assert.equal(noChange.teamsAdded, 0);
  } finally {
    await pg.close();
  }
});
test("stale roster, configuration, published learning and date changes block import without partial writes", async () => {
  for (const change of [
    "update fb_profiles set name='Changed' where email='learner@example.test'",
    "update fb_config set settings=settings||'{\"onboardingDays\":42}' where id",
    `insert into fb_documents(id,draft,published) values('${id(20)}','{}','{"id":"${id(20)}","kind":"course","title":"New","version":1,"status":"published","lessons":[]}')`,
    "update fb_roster_import_runs set review_day=review_day-1",
  ]) {
    const { pg, store } = await database();
    try {
      const input = csv([
        ["New", "new@example.test", "", "Sales", "Organization", ""],
      ]);
      const review = await reviewRosterImport(admin, input, store);
      await pg.exec(change);
      const before = await unchangedData(pg);
      await assert.rejects(
        applyRosterImport(admin, input, review.token!, store),
        /changed/,
      );
      assert.deepEqual(await unchangedData(pg), before);
    } finally {
      await pg.close();
    }
  }
});
test("failed validation is atomic and saved learning deadlines, completed progress, source overlap, Auth and grants survive", async () => {
  const { pg, store } = await database();
  try {
    const root = (await store.readConfiguration()).teams.find(
      (t) => t.system === "organization",
    )!;
    await pg.query(
      "update fb_config set teams=teams||$1::jsonb, groups=$2::jsonb where id",
      [
        JSON.stringify([
          {
            id: "sales",
            name: "Sales",
            parentId: root.id,
            learningItems: [{ kind: "course", id: id(10) }],
          },
        ]),
        JSON.stringify([
          {
            id: "direct",
            name: "Direct",
            teamIds: ["sales"],
            learningItems: [{ kind: "course", id: id(10) }],
          },
        ]),
      ],
    );
    await pg.exec(
      `insert into fb_documents(id,draft,published) values('${id(10)}','{"id":"${id(10)}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}','{"id":"${id(10)}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}'); update fb_profiles set groups='["direct"]',team_id='sales',hire_date='2026-01-01' where id='${id(2)}'; select fb_sync_learning(); insert into fb_progress(user_id,content_id,version,lessons,passed) values('${id(2)}','${id(10)}',1,'[]',true); insert into fb_mcp_grants(user_id,client_id,client_name) values('${id(1)}','client','Client');`,
    );
    const episodes = await value(
        pg,
        "select jsonb_agg(to_jsonb(e) order by id) value from fb_assignment_episodes e",
      ),
      progress = await value(
        pg,
        "select jsonb_agg(to_jsonb(p)) value from fb_progress p",
      ),
      auth = await value(
        pg,
        "select jsonb_agg(to_jsonb(a)) value from auth.users a",
      ),
      grants = await value(
        pg,
        "select jsonb_agg(to_jsonb(g)) value from fb_mcp_grants g",
      );
    const input = csv([
      ["Renamed", "learner@example.test", "2026-09-30", "Sales", "", ""],
    ]);
    const review = await reviewRosterImport(admin, input, store);
    await applyRosterImport(admin, input, review.token!, store);
    assert.deepEqual(
      await value(
        pg,
        "select jsonb_agg(to_jsonb(e) order by id) value from fb_assignment_episodes e",
      ),
      episodes,
    );
    assert.deepEqual(
      await value(pg, "select jsonb_agg(to_jsonb(p)) value from fb_progress p"),
      progress,
    );
    assert.deepEqual(
      await value(pg, "select jsonb_agg(to_jsonb(a)) value from auth.users a"),
      auth,
    );
    assert.deepEqual(
      await value(
        pg,
        "select jsonb_agg(to_jsonb(g)) value from fb_mcp_grants g",
      ),
      grants,
    );
    const bad = csv([
      ["New", "new@example.test", "", "Invalid", "Invalid", ""],
    ]);
    const invalid = await reviewRosterImport(admin, bad, store),
      before = await unchangedData(pg);
    assert.equal(invalid.valid, false);
    await assert.rejects(
      applyRosterImport(admin, bad, invalid.token!, store),
      /blocking/,
    );
    assert.deepEqual(await unchangedData(pg), before);
    // Force a failure after insertion to prove the whole database operation rolls back.
    const valid = csv([["New", "new@example.test", "", "", "", ""]]);
    const token = await reviewRosterImport(admin, valid, store);
    const snapshot = await store.readAdminPeopleSnapshot(admin.id);
    const payload = {
      teams: snapshot.teams,
      users: snapshot.users.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        groups: u.groups,
        teamId: u.team_id || undefined,
        hireDate: u.hire_date || undefined,
        onboardingStart: u.onboarding_start || undefined,
      })),
    };
    payload.users.push({
      id: id(90),
      name: "New",
      email: "new@example.test",
      role: "learner",
      active: true,
      groups: [],
      teamId: "missing",
    } as any);
    const hash = createHash("sha256").update(valid).digest("hex");
    const baseline = await unchangedData(pg);
    await assert.rejects(
      store.rosterImportOperation(admin.id, hash, token.token!, payload),
      /Team does not exist/,
    );
    assert.deepEqual(await unchangedData(pg), baseline);
  } finally {
    await pg.close();
  }
});
test("the full row limit and ten-level teams import together with 100 courses, safe retries and service-only permissions", async () => {
  const { pg, store } = await database();
  try {
    // Each imported person inherits 100 courses through the Organization branch.
    const courses = Array.from({ length: 100 }, (_, i) => ({
      id: id(1000 + i),
      kind: "course",
      title: `Course ${i}`,
      status: "published",
      version: 1,
      lessons: [],
    }));
    for (const course of courses)
      await pg.query(
        "insert into fb_documents(id,draft,published) values($1,$2,$2)",
        [course.id, JSON.stringify(course)],
      );
    const cfg = await store.readConfiguration();
    cfg.teams.find((t) => t.system === "organization")!.learningItems =
      courses.map((c) => ({ kind: "course", id: c.id }));
    await pg.query("update fb_config set teams=$1 where id", [
      JSON.stringify(cfg.teams),
    ]);
    await pg.exec("select fb_sync_learning()");
    const input = csv([
      ...Array.from({ length: ROSTER_IMPORT_MAX_ROWS }, (_, i) => [
        `Person ${i}`,
        `person-${i}@example.test`,
        "",
        `Team ${i % 10}`,
        i % 10 ? `Team ${(i % 10) - 1}` : "Organization",
        "",
      ]),
    ]);
    const started = performance.now();
    const review = await reviewRosterImport(admin, input, store);
    assert.equal(review.valid, true);
    const result = await applyRosterImport(admin, input, review.token!, store);
    assert.equal(result.peopleAdded, ROSTER_IMPORT_MAX_ROWS);
    assert.equal(result.teamsAdded, 10);
    assert.equal(
      (await store.listProfiles()).length,
      ROSTER_IMPORT_MAX_ROWS + 2,
    );
    assert.equal(
      await value(
        pg,
        "select count(*)::integer value from fb_assignment_episodes where ended_at is null",
      ),
      (ROSTER_IMPORT_MAX_ROWS + 2) * 100,
    );
    console.log(
      JSON.stringify({
        scalePeople: ROSTER_IMPORT_MAX_ROWS,
        scaleCourses: 100,
        reviewAndApplyMs: Math.round(performance.now() - started),
      }),
    );
    const receipts = await Promise.all([
      applyRosterImport(admin, input, review.token!, store),
      applyRosterImport(admin, input, review.token!, store),
    ]);
    assert.deepEqual(receipts, [result, result]);
    await assert.rejects(
      applyRosterImport(admin, input + "\n", review.token!, store),
      /match/,
    );
    await pg.exec(
      `update fb_profiles set role='learner' where id='${admin.id}'`,
    );
    await assert.rejects(
      applyRosterImport(admin, input, review.token!, store),
      /Administrator/,
    );
    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        await value(
          pg,
          "select has_function_privilege($1,'public.fb_roster_import(uuid,text,uuid,jsonb)','execute') value",
          [role],
        ),
        false,
      );
      assert.equal(
        await value(
          pg,
          "select has_table_privilege($1,'public.fb_roster_import_runs','select') value",
          [role],
        ),
        false,
      );
    }
  } finally {
    await pg.close();
  }
});
test("apply accepts only bounded CSV and an issued UUID, never client proposals or totals", async () => {
  const request = (body: unknown) =>
    new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.deepEqual(await readRosterApply(request({ csv: "a", token: id(1) })), {
    csv: "a",
    token: id(1),
  });
  for (const body of [
    { csv: "a" },
    { csv: "a", token: "fake" },
    { csv: "a", token: id(1), users: [] },
    { csv: "a", token: id(1), counts: {} },
  ])
    await assert.rejects(readRosterApply(request(body)), /valid UTF-8/);
});

test("a lost response after database commit is recoverable without another write", async () => {
  const { pg, store } = await database();
  try {
    const input = csv([
      ["Lost Response", "lost@example.test", "2026-09-30", "", "", ""],
    ]);
    const review = await reviewRosterImport(admin, input, store);
    let dropped = false;
    const unreliable = {
      ...store,
      rosterImportOperation: async (
        ...args: Parameters<DataStore["rosterImportOperation"]>
      ) => {
        const result = await store.rosterImportOperation(...args);
        if (args[3] && !dropped) {
          dropped = true;
          throw new Error("Response lost after commit");
        }
        return result;
      },
    } as DataStore;
    await assert.rejects(
      applyRosterImport(admin, input, review.token!, unreliable),
      /lost/,
    );
    const committed = await unchangedData(pg);
    const result = await applyRosterImport(admin, input, review.token!, store);
    assert.equal(result.peopleAdded, 1);
    assert.deepEqual(await unchangedData(pg), committed);
  } finally {
    await pg.close();
  }
});

test("CSV recovery atomically restores a signed-in deleted user, retains history and replays without another unlock", async () => {
  const { pg, store } = await database();
  try {
    await pg.exec(
      `update fb_profiles set role='contributor',hire_date='2026-01-01' where id='${id(2)}'; insert into fb_documents(id,draft,published) values('${id(10)}','{"kind":"course","title":"Saved course","version":1,"lessons":[]}','{"kind":"course","title":"Saved course","version":1,"lessons":[]}'); insert into fb_progress(user_id,content_id,version,lessons,passed) values('${id(2)}','${id(10)}',1,'["lesson"]',true); insert into fb_mcp_grants(user_id,client_id,client_name) values('${id(2)}','client','Client');`,
    );
    const original = await value(
      pg,
      "select to_jsonb(p) value from fb_profiles p where id=$1",
      [id(2)],
    );
    await pg.query("select fb_delete_users($1,$2,$3,'owner@example.test')", [
      admin.id,
      (await store.readConfiguration()).governance_revision,
      JSON.stringify([id(2)]),
    ]);
    await pg.query("update fb_deleted_items set auth_locked=true where id=$1", [
      id(2),
    ]);
    const preserved = await value(
      pg,
      "select jsonb_build_object('auth',(select jsonb_agg(to_jsonb(a)) from auth.users a),'progress',(select jsonb_agg(to_jsonb(p)) from fb_progress p),'grants',(select jsonb_agg(to_jsonb(g)) from fb_mcp_grants g)) value",
    );
    const input = csv([
      [
        "Returned",
        " LEARNER@example.test ",
        "",
        "Sales",
        "Organization",
        "learner@example.test",
      ],
    ]);
    const review = await reviewRosterImport(admin, input, store);
    assert.equal(review.valid, true);
    assert.equal(review.people[0].status, "changed");
    assert.ok(
      review.issues.some(
        (i) => i.code === "restore-user" && i.severity === "notice",
      ),
    );
    const calls: string[] = [];
    const unlock = async (uid: string) => {
      calls.push(uid);
      assert.equal(
        await value(pg, "select active value from fb_profiles where id=$1", [
          uid,
        ]),
        false,
        "deleted profile denies access during Auth unlock",
      );
      assert.ok(
        await value(
          pg,
          "select deleted_at value from fb_profiles where id=$1",
          [uid],
        ),
      );
    };
    const result = await applyRosterImport(
      admin,
      input,
      review.token!,
      store,
      unlock,
    );
    assert.equal(result.peopleAdded, 0);
    assert.equal(result.peopleUpdated, 1);
    const restored = await value(
      pg,
      "select to_jsonb(p) value from fb_profiles p where id=$1",
      [id(2)],
    );
    assert.equal(restored.active, true);
    assert.equal(restored.deleted_at, null);
    assert.equal(restored.auth_user_id, original.auth_user_id);
    assert.equal(restored.added_at, original.added_at);
    assert.equal(restored.hire_date, original.hire_date);
    assert.equal(
      restored.role,
      "manager",
      "CSV can explicitly assign manager, never recover the old contributor role",
    );
    assert.deepEqual(restored.groups, []);
    assert.equal(
      await value(
        pg,
        "select count(*)::integer value from fb_deleted_items where id=$1",
        [id(2)],
      ),
      0,
    );
    assert.deepEqual(
      await value(
        pg,
        "select jsonb_build_object('auth',(select jsonb_agg(to_jsonb(a)) from auth.users a),'progress',(select jsonb_agg(to_jsonb(p)) from fb_progress p),'grants',(select jsonb_agg(to_jsonb(g)) from fb_mcp_grants g)) value",
      ),
      preserved,
    );
    assert.deepEqual(
      await applyRosterImport(admin, input, review.token!, store, unlock),
      result,
    );
    assert.deepEqual(calls, [id(2)]);
  } finally {
    await pg.close();
  }
});
test("CSV recovery handles pending users and unlock failures with no partial import or duplicate identity", async () => {
  const { pg, store } = await database();
  try {
    const input = csv([
      ["Pending", "pending@example.test", "2026-01-01", "", "", ""],
    ]);
    let review = await reviewRosterImport(admin, input, store);
    await applyRosterImport(admin, input, review.token!, store);
    const pending = (await store.listProfiles()).find(
      (p) => p.email === "pending@example.test",
    )!;
    assert.ok(pending.added_at);
    await pg.query("select fb_delete_users($1,$2,$3,'owner@example.test')", [
      admin.id,
      (await store.readConfiguration()).governance_revision,
      JSON.stringify([pending.id, id(2)]),
    ]);
    await pg.exec("update fb_deleted_items set auth_locked=true");
    const mixed = csv([
      ["Pending", pending.email, "", "", "", ""],
      ["Learner", "learner@example.test", "", "", "", ""],
    ]);
    review = await reviewRosterImport(admin, mixed, store);
    const before = await unchangedData(pg);
    await assert.rejects(
      applyRosterImport(admin, mixed, review.token!, store, async () => {
        throw Error("provider unavailable");
      }),
      /No import was saved/,
    );
    assert.deepEqual(await unchangedData(pg), before);
    const calls: string[] = [];
    await applyRosterImport(admin, mixed, review.token!, store, async (id) => {
      calls.push(id);
    });
    assert.deepEqual(
      calls,
      [id(2)],
      "pending users have no provider login to unlock",
    );
    const restored = (await store.listProfiles()).find(
      (p) => p.email === pending.email,
    )!;
    assert.equal(restored.id, pending.id);
    assert.equal(restored.added_at, pending.added_at);
    assert.equal(restored.active, true);
    assert.equal(restored.role, "learner");
    assert.equal(restored.auth_user_id, null);
  } finally {
    await pg.close();
  }
});
test("CSV recovery rejects purge/deactivation races, privileged restoration and orphaned email tombstones", async () => {
  const { pg, store } = await database();
  try {
    await pg.query("select fb_delete_users($1,$2,$3,'owner@example.test')", [
      admin.id,
      (await store.readConfiguration()).governance_revision,
      JSON.stringify([id(2)]),
    ]);
    await pg.exec("update fb_deleted_items set auth_locked=true");
    const input = csv([["Learner", "learner@example.test", "", "", "", ""]]);
    const hash = createHash("sha256").update(input).digest("hex");
    const review = await reviewRosterImport(admin, input, store);
    const cfg = await store.readConfiguration();
    const payload = {
      users: [
        { ...admin },
        {
          id: id(2),
          name: "Learner",
          email: "learner@example.test",
          active: true,
          role: "admin",
          groups: [],
        },
      ],
      teams: cfg.teams,
    };
    const before = await unchangedData(pg);
    await assert.rejects(
      store.rosterImportOperation(
        admin.id,
        hash,
        review.token!,
        payload as any,
      ),
      /explicitly assigned manager/,
    );
    assert.deepEqual(await unchangedData(pg), before);
    for (const state of [
      "purging=true",
      "auth_locked=false",
      "deleted_at=now()-interval '31 days',purge_after=now()-interval '1 second'",
    ]) {
      const goodReview = await reviewRosterImport(admin, input, store);
      await pg.exec("update fb_deleted_items set " + state);
      const denied = await reviewRosterImport(admin, input, store);
      assert.equal(denied.valid, false);
      assert.ok(
        denied.issues.some(
          (i) => i.code === "deleted-person" && i.severity === "error",
        ),
      );
      const unchanged = await unchangedData(pg);
      await assert.rejects(
        applyRosterImport(admin, input, goodReview.token!, store, async () => {
          throw Error("should never unlock stale restoration");
        }),
        /changed/,
      );
      assert.deepEqual(await unchangedData(pg), unchanged);
      await pg.exec(
        "update fb_deleted_items set purging=false,auth_locked=true,purge_after=now()+interval '30 days'",
      );
    }
    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        await value(
          pg,
          "select has_function_privilege($1,'public.fb_roster_import(uuid,text,uuid,jsonb)','execute') value",
          [role],
        ),
        false,
      );
    }
    await pg.exec(
      "insert into fb_deleted_items(entity,id,name,email,revision,deleted_by,snapshot,auth_locked) values('user','" +
        id(55) +
        "','Orphan','orphan@example.test',1,'" +
        admin.id +
        "','{}',true)",
    );
    assert.equal(
      (
        await reviewRosterImport(
          admin,
          csv([["Orphan", "orphan@example.test", "", "", "", ""]]),
          store,
        )
      ).valid,
      false,
    );
  } finally {
    await pg.close();
  }
});
