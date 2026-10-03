import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  rosterDatabase,
  migrate,
  value,
  episodeMigration,
  contributorMigration,
  flatGroupMigration,
} from "../helpers/roster-database";
import {
  reviewRosterImport,
  applyRosterImport,
  readRosterApply,
} from "../../server/roster-import";
import type { DataStore } from "../../server/ports/data";
import type { User } from "../../lib/types";
import { serializeCsv } from "../../lib/csv";
import { rosterTemplate } from "../../lib/roster-import";
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
const migration = "20261003140729_roster_csv_import.sql";
async function database() {
  const pg = await rosterDatabase();
  for (const file of [
    episodeMigration,
    contributorMigration,
    flatGroupMigration,
    "20261002064454_team_group_course_assignments.sql",
    "20261002135103_builtin_organization_team.sql",
    "20261002184642_organization_membership.sql",
    "20261002210106_combined_assignment_organization.sql",
    "20261002214011_combined_governance_safeguards.sql",
  ])
    await migrate(pg, file);
  await pg.exec(
    `insert into auth.users values('${id(1)}'),('${id(2)}'); insert into fb_profiles(id,auth_user_id,email,name,role) values('${id(1)}','${id(1)}','admin@example.test','Admin','admin'),('${id(2)}','${id(2)}','learner@example.test','Learner','learner');`,
  );
  const before = await unchangedData(pg);
  const functions = await value(
    pg,
    "select jsonb_agg(jsonb_build_object('name',proname,'definition',pg_get_functiondef(p.oid),'acl',proacl) order by p.oid) value from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'",
  );
  await migrate(pg, migration);
  assert.deepEqual(
    await unchangedData(pg),
    before,
    "additive migration preserves every existing application table",
  );
  assert.deepEqual(
    await value(
      pg,
      "select jsonb_agg(jsonb_build_object('name',proname,'definition',pg_get_functiondef(p.oid),'acl',proacl) order by p.oid) value from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname not in ('fb_roster_import','fb_roster_import_fingerprint')",
    ),
    functions,
    "all existing functions and grants are unchanged",
  );
  const store = {
    readConfiguration: () =>
      value(pg, "select to_jsonb(c) value from fb_config c where id"),
    readAdminPeopleSnapshot: (actor: string) =>
      value(pg, "select fb_admin_people_snapshot($1) value", [actor]),
    listDeletedProfileEmails: async () =>
      (
        await pg.query<{ email: string }>(
          "select email from fb_deleted_items where entity='user' and email is not null",
        )
      ).rows.map((row) => row.email),
    listProfiles: async () =>
      (await pg.query("select * from fb_profiles order by id")).rows,
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
test("500 people and ten-level teams import together; service-only permissions and denied replay are enforced", async () => {
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
      ...Array.from({ length: 500 }, (_, i) => [
        `Person ${i}`,
        `person-${i}@example.test`,
        "",
        `Team ${i % 10}`,
        i % 10 ? `Team ${(i % 10) - 1}` : "Organization",
        "",
      ]),
    ]);
    const review = await reviewRosterImport(admin, input, store);
    assert.equal(review.valid, true);
    const result = await applyRosterImport(admin, input, review.token!, store);
    assert.equal(result.peopleAdded, 500);
    assert.equal(result.teamsAdded, 10);
    assert.equal((await store.listProfiles()).length, 502);
    assert.equal(
      await value(
        pg,
        "select count(*)::integer value from fb_assignment_episodes where ended_at is null",
      ),
      50200,
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
