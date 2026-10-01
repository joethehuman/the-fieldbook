import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  learningStage,
  onboardingClockTarget,
  learningState,
} from "../lib/learning";
import { defaultSettings } from "../lib/settings";
import type { User } from "../lib/types";

const admin = "00000000-0000-4000-8000-000000000001";
const learner = "00000000-0000-4000-8000-000000000002";
const login = "00000000-0000-4000-8000-000000000003";
const course = "00000000-0000-4000-8000-000000000004";
const migrations = [
  "202609190001_fieldbook.sql",
  "202609190002_mcp_audience.sql",
  "202609200001_governance.sql",
  "202609200002_assignments.sql",
  "202609200003_required_learning.sql",
  "202609200004_learning_groups.sql",
  "20260923180607_guarded_team_deletion.sql",
  "20260923230000_scope_pending_group_cleanup.sql",
  "20260924150351_anonymous_feedback.sql",
  "20260926182840_general_feedback.sql",
  "20260927150657_bulk_actions_recovery.sql",
  "20260927151533_bulk_recovery_references.sql",
  "20260927152156_account_deletion_lock.sql",
  "20260927153217_media_cleanup_lock.sql",
  "20261001202740_admin_people_reads.sql",
];
const migration = () =>
  readFile(
    new URL(
      "../supabase/migrations/20261001222227_roster_people.sql",
      import.meta.url,
    ),
    "utf8",
  );
async function database() {
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create role supabase_auth_admin; create schema auth; create table auth.users(id uuid primary key);
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create schema extensions;
    create function extensions.gen_random_bytes(integer) returns bytea language sql as 'select decode(repeat(''ab'',$1),''hex'')';`);
  // Search and scheduler extensions are exercised by their own suites. This fixture
  // applies the complete roster/governance/recovery chain using synthetic identities.
  for (const name of migrations)
    await pg.exec(
      await readFile(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  await pg.exec(`insert into auth.users values('${admin}'),('${learner}'),('${login}');
    insert into public.fb_profiles(id,name,email,role,onboarding_start) values
      ('${admin}','Admin','admin@example.test','admin',null),
      ('${learner}','Learner','learner@example.test','learner','2026-01-01');
    update public.fb_config set settings=settings||'{"registration":"closed","onboardingDays":45}',
      groups='[{"id":"sales","name":"Sales","learningItems":[],"teamIds":[]}]', teams='[{"id":"west","name":"West"},{"id":"child","name":"West child","parentId":"west"},{"id":"east","name":"East"}]' where id;
    insert into public.fb_pending_profiles(email,name,role,groups,team_id,onboarding_start) values
      ('manager@example.test','Pending Manager','manager','["sales"]','west','2026-09-01'),
      ('pending@example.test','Pending Learner','learner','["sales"]','child',null);
    insert into public.fb_documents(id,draft,published,revision,published_revision) values('${course}',
      '{"id":"${course}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}',
      '{"id":"${course}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}',1,1);
    insert into public.fb_progress(user_id,content_id,version,lessons,passed) values('${learner}','${course}',1,'["lesson-a"]',true);
    insert into public.fb_feedback(id,user_id,content_id,version,rating,comment) values(gen_random_uuid(),'${learner}','${course}',1,'up','Preserve me');
    insert into public.fb_mcp_grants(user_id,client_id,client_name) values('${admin}','client-one','Client');`);
  return pg;
}
async function value(pg: PGlite, sql: string, args: any[] = []) {
  return (await pg.query<any>(sql, args)).rows[0]?.value;
}
async function person(pg: PGlite, email: string) {
  return value(
    pg,
    "select to_jsonb(p) as value from public.fb_profiles p where email=$1",
    [email],
  );
}
async function save(pg: PGlite, patch: (data: any) => void) {
  const snapshot = await value(
    pg,
    "select public.fb_admin_people_snapshot($1) as value",
    [admin],
  );
  const data = {
    groups: snapshot.groups,
    teams: snapshot.teams,
    curricula: snapshot.curricula,
    users: snapshot.users.map((p: any) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      active: p.active,
      groups: p.groups,
      teamId: p.team_id,
      hireDate: p.hire_date,
      onboardingStart: p.onboarding_start,
    })),
  };
  patch(data);
  return pg.query("select public.fb_save_governance($1,$2,'save',$3)", [
    admin,
    snapshot.revision,
    JSON.stringify(data),
  ]);
}

test("onboarding stage expires after the applied window, independent of due dates or login", () => {
  const user: User = {
    id: learner,
    name: "Learner",
    email: "learner@example.test",
    role: "learner",
    active: true,
    groups: [],
    registered: false,
    hireDate: "2026-01-01",
    onboardingDays: 45,
  };
  assert.equal(onboardingClockTarget(user), "2026-02-15");
  assert.equal(learningStage(user, defaultSettings, "2026-02-15"), "New user");
  assert.equal(
    learningStage(user, defaultSettings, "2026-02-16"),
    "Existing user",
  );
  const changed = {
    ...defaultSettings,
    onboardingDays: 90,
    dueDatesEnabled: false,
  };
  assert.equal(learningStage(user, changed, "2026-02-16"), "Existing user");
  assert.equal(onboardingClockTarget(user, changed), "2026-02-15");
  assert.equal(
    learningStage({ ...user, hireDate: undefined }, changed),
    "Existing user",
  );
  assert.equal(
    onboardingClockTarget({
      ...user,
      hireDate: undefined,
      onboardingStart: "2026-01-01",
    }),
    "2026-02-15",
  );
  assert.equal(learningState([], user, [], [], changed).onboarding, false);
  assert.equal(onboardingClockTarget({ ...user, id: "guest" }), undefined);
});

test("roster migration preserves identities/history; preregistered managers activate without resetting their roster", async () => {
  const pg = await database();
  try {
    const before = await value(
      pg,
      "select jsonb_build_object('progress',(select jsonb_agg(to_jsonb(p)) from public.fb_progress p),'feedback',(select jsonb_agg(to_jsonb(f)) from public.fb_feedback f),'grants',(select jsonb_agg(to_jsonb(g)) from public.fb_mcp_grants g),'documents',(select jsonb_agg(to_jsonb(d)) from public.fb_documents d)) as value",
    );
    await pg.exec(await migration());
    assert.equal((await person(pg, "admin@example.test")).auth_user_id, admin);
    const legacy = await person(pg, "learner@example.test");
    assert.equal(legacy.id, learner);
    assert.equal(legacy.hire_date, null);
    assert.equal(legacy.onboarding_start, "2026-01-01");
    assert.equal(legacy.onboarding_days, 45);
    const after = await value(
      pg,
      "select jsonb_build_object('progress',(select jsonb_agg(to_jsonb(p)) from public.fb_progress p),'feedback',(select jsonb_agg(to_jsonb(f)) from public.fb_feedback f),'grants',(select jsonb_agg(to_jsonb(g)) from public.fb_mcp_grants g),'documents',(select jsonb_agg(to_jsonb(d)) from public.fb_documents d)) as value",
    );
    assert.deepEqual(after, before);
    const pending = await person(pg, "manager@example.test");
    assert.equal(pending.auth_user_id, null);
    assert.equal(pending.onboarding_days, 45);
    await save(pg, (data) => {
      data.teams[0].managerId = pending.id;
    });
    const subordinate = await person(pg, "pending@example.test");
    assert.equal(subordinate.team_id, "child");
    assert.deepEqual(
      (
        await value(pg, "select public.fb_governance_snapshot($1) as value", [
          pending.id,
        ])
      ).users,
      [],
      "no report access before verified activation",
    );
    await pg.query(
      "insert into public.fb_progress(user_id,content_id,version,lessons,passed) values($1,$2,1,'[\"lesson-a\"]',true)",
      [pending.id, course],
    );
    const activated = await value(
      pg,
      "select to_jsonb(public.fb_register_profile($1,' MANAGER@example.test ','Provider name',false)) as value",
      [login],
    );
    assert.equal(activated.id, pending.id);
    assert.notEqual(activated.id, login);
    assert.deepEqual({ ...activated, auth_user_id: null }, pending);
    assert.equal(
      await value(
        pg,
        "select passed as value from public.fb_progress where user_id=$1",
        [pending.id],
      ),
      true,
    );
    const scope = await value(
      pg,
      "select public.fb_governance_snapshot($1) as value",
      [pending.id],
    );
    assert(scope.users.some((p: any) => p.id === subordinate.id));
    assert(!scope.users.some((p: any) => p.id === admin));
    const compact = await value(
      pg,
      "select public.fb_admin_people_snapshot($1) as value",
      [admin],
    );
    assert.equal(compact.users.length, 4);
    assert.deepEqual(compact.progress, []);
    assert.deepEqual(compact.pending, []);
    assert.deepEqual(
      await value(
        pg,
        "select to_jsonb(public.fb_register_profile($1,'manager@example.test','Again',false)) as value",
        [login],
      ),
      activated,
    );
    await assert.rejects(
      pg.query(
        "select public.fb_register_profile(gen_random_uuid(),'unknown@example.test','Unknown',false)",
      ),
      /closed/,
    );
    await assert.rejects(
      pg.query(
        "select public.fb_register_profile(gen_random_uuid(),'admin@example.test','Collision',false)",
      ),
      /already linked/,
    );
    await pg.exec(
      "update public.fb_config set settings=settings||'{\"onboardingDays\":90}' where id",
    );
    await save(pg, (data) => {
      data.users.find((p: any) => p.id === subordinate.id).hireDate =
        "2026-09-01";
    });
    assert.equal(
      (await person(pg, "pending@example.test")).onboarding_days,
      90,
    );
    assert.equal(
      (await person(pg, "manager@example.test")).onboarding_days,
      45,
    );
    await save(pg, (data) => {
      data.users.find((p: any) => p.id === subordinate.id).hireDate =
        "2026-09-02";
    });
    assert.equal(
      (await person(pg, "pending@example.test")).onboarding_days,
      90,
    );
    const rev = await value(
      pg,
      "select governance_revision as value from public.fb_config where id",
    );
    const prereg = {
      email: "created@example.test",
      name: "Created",
      role: "learner",
      groups: ["sales"],
      hireDate: "2026-09-01",
    };
    await pg.query("select public.fb_save_governance($1,$2,'pending',$3)", [
      admin,
      rev,
      JSON.stringify(prereg),
    ]);
    const created = await person(pg, prereg.email);
    assert.equal(created.auth_user_id, null);
    assert.equal(created.onboarding_days, 90);
    assert(created.effective_group_joined_at.sales);
    await assert.rejects(
      pg.query("select public.fb_save_governance($1,$2,'pending',$3)", [
        admin,
        rev + 1,
        JSON.stringify(prereg),
      ]),
      /already uses/,
    );
    await pg.exec(
      `insert into public.fb_mcp_grants(user_id,client_id,client_name) values('${pending.id}','client-one','Client'); insert into public.fb_oauth_config(id,resource) values(true,'https://fieldbook.example/api/mcp') on conflict(id) do update set resource=excluded.resource;`,
    );
    const event = {
      user_id: login,
      claims: { sub: login, client_id: "client-one", aud: "authenticated" },
    };
    assert.equal(
      (
        await value(pg, "select public.fb_access_token_hook($1) as value", [
          JSON.stringify(event),
        ])
      ).claims.aud,
      "https://fieldbook.example/api/mcp",
    );
    const ownerLogin = "00000000-0000-4000-8000-000000000005";
    await pg.query("insert into auth.users values($1)", [ownerLogin]);
    await pg.query(
      "insert into public.fb_profiles(email,name,role) values('owner@example.test','Preregistered owner','learner')",
    );
    const ownerBefore = await person(pg, "owner@example.test");
    const owner = await value(
      pg,
      "select to_jsonb(public.fb_register_profile($1,'owner@example.test','Provider owner',true)) as value",
      [ownerLogin],
    );
    assert.equal(owner.id, ownerBefore.id);
    assert.equal(owner.role, "admin");
    assert.equal(owner.hire_date, null);
    assert.equal(owner.onboarding_start, null);
    await pg.exec("set role authenticated");
    await assert.rejects(
      pg.query("select * from public.fb_profiles"),
      /permission denied/,
    );
    await assert.rejects(
      pg.query("select public.fb_admin_people_snapshot($1)", [admin]),
      /permission denied/,
    );
    await assert.rejects(
      pg.query(
        "select public.fb_register_profile($1,'x@example.test','X',false)",
        [login],
      ),
      /permission denied/,
    );
    await pg.exec("reset role");
  } finally {
    await pg.close();
  }
});

test("pending people retain recovery protections and purge without an Auth account", async () => {
  const pg = await database();
  try {
    await pg.exec(await migration());
    const pending = await person(pg, "pending@example.test");
    const revision = () =>
      value(
        pg,
        "select governance_revision as value from public.fb_config where id",
      );
    await pg.query(
      "insert into public.fb_progress(user_id,content_id,version,passed) values($1,$2,1,true)",
      [pending.id, course],
    );
    const deleted = await value(
      pg,
      "select public.fb_delete_users($1,$2,$3,'admin@example.test') as value",
      [admin, await revision(), JSON.stringify([pending.id])],
    );
    assert.equal(deleted[0].status, "changed");
    await assert.rejects(
      pg.query(
        "select public.fb_register_profile($1,'pending@example.test','Pending',false)",
        [login],
      ),
      /pending deletion/,
    );
    await pg.query(
      "update public.fb_deleted_items set claimed_at=null,claim=null,auth_locked=true where id=$1",
      [pending.id],
    );
    await pg.query("select public.fb_restore_deleted($1,'user',$2,1)", [
      admin,
      pending.id,
    ]);
    const restored = await person(pg, "pending@example.test");
    assert.equal(restored.active, false);
    assert.equal(restored.role, "learner");
    assert.equal(
      await value(
        pg,
        "select passed as value from public.fb_progress where user_id=$1",
        [pending.id],
      ),
      true,
    );
    await assert.rejects(
      pg.query(
        "select public.fb_register_profile($1,'pending@example.test','Pending',false)",
        [login],
      ),
      /inactive/,
    );
    await save(pg, (data) => {
      data.users.find((p: any) => p.id === pending.id).active = true;
    });
    await value(
      pg,
      "select public.fb_delete_users($1,$2,$3,'admin@example.test') as value",
      [admin, await revision(), JSON.stringify([pending.id])],
    );
    await pg.query(
      "update public.fb_deleted_items set deleted_at=now()-interval '32 days',purge_after=now()-interval '1 day',purging=true,claim=$1 where id=$1",
      [pending.id],
    );
    await pg.query("select public.fb_finish_deletion('user',$1,$1)", [
      pending.id,
    ]);
    assert.equal(await person(pg, "pending@example.test"), undefined);
    assert.equal(
      await value(
        pg,
        "select count(*)::int as value from public.fb_progress where user_id=$1",
        [pending.id],
      ),
      0,
    );
    assert.equal(
      await value(
        pg,
        "select count(*)::int as value from public.fb_audit where snapshot::text like $1",
        [`%${pending.id}%`],
      ),
      0,
    );
    assert.equal(
      await value(
        pg,
        "select count(*)::int as value from public.fb_profiles where id=$1",
        [learner],
      ),
      1,
    );
    // Verify deletion when the person ID differs from the provider subject.
    await pg.query(
      "insert into public.fb_profiles(email,name) values('activated@example.test','Activated')",
    );
    const activated = await value(
      pg,
      "select to_jsonb(public.fb_register_profile($1,'activated@example.test','Provider',false)) as value",
      [login],
    );
    assert.notEqual(activated.id, login);
    await pg.query(
      "insert into public.fb_progress(user_id,content_id,version,passed) values($1,$2,1,true)",
      [activated.id, course],
    );
    await value(
      pg,
      "select public.fb_delete_users($1,$2,$3,'admin@example.test') as value",
      [admin, await revision(), JSON.stringify([activated.id])],
    );
    await pg.query(
      "update public.fb_deleted_items set deleted_at=now()-interval '32 days',purge_after=now()-interval '1 day',purging=true,claim=$1 where id=$1",
      [activated.id],
    );
    await assert.rejects(
      pg.query("select public.fb_finish_deletion('user',$1,$1)", [
        activated.id,
      ]),
      /Delete the Auth/,
    );
    await pg.query("delete from auth.users where id=$1", [login]);
    await pg.query("select public.fb_finish_deletion('user',$1,$1)", [
      activated.id,
    ]);
    assert.equal(await person(pg, "activated@example.test"), undefined);
    assert.equal(
      await value(
        pg,
        "select count(*)::int as value from public.fb_progress where user_id=$1",
        [activated.id],
      ),
      0,
    );
    await pg.exec(
      "insert into public.fb_profiles(email,name) select 'scale-'||n||'@example.test','Scale '||n from generate_series(1,500) n",
    );
    const roster = await value(
      pg,
      "select public.fb_admin_people_snapshot($1) as value",
      [admin],
    );
    assert.equal(
      roster.users.filter((p: any) => p.email.startsWith("scale-")).length,
      500,
    );
    assert.deepEqual(roster.progress, []);
  } finally {
    await pg.close();
  }
});

test("conflicting legacy emails stop the migration atomically", async () => {
  const pg = await database();
  try {
    await pg.exec(
      "insert into public.fb_pending_profiles(email,name,role,groups) values('admin@example.test','Conflict','learner','[]')",
    );
    await assert.rejects(
      pg.exec(await migration()),
      /duplicate pending and registered/,
    );
    await pg.exec("rollback");
    assert.equal(
      await value(
        pg,
        "select count(*)::int as value from information_schema.columns where table_name='fb_profiles' and column_name='auth_user_id'",
      ),
      0,
    );
    assert.equal(
      await value(
        pg,
        "select count(*)::int as value from public.fb_pending_profiles",
      ),
      3,
    );
  } finally {
    await pg.close();
  }
});
