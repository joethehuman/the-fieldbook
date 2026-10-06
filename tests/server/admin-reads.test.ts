import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { adminSnapshot } from "../../server/admin-snapshot";
import { defaultSettings } from "../../lib/settings";
import type { User } from "../../lib/types";

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
const migration = readFileSync(
  new URL(
    `../../supabase/history/initial-development/${readdirSync(new URL("../../supabase/history/initial-development/", import.meta.url)).find((name) => name.endsWith("_admin_people_reads.sql"))}`,
    import.meta.url,
  ),
  "utf8",
);

test("People migration preserves data, returns all 600 accounts, scopes complete history and rejects unauthorized callers", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create role anon; create role authenticated; create role service_role;
      create table fb_config(id boolean primary key, governance_revision integer, groups jsonb, teams jsonb, curricula jsonb);
      create table fb_profiles(id uuid primary key, name text, email text, role text, active boolean, deleted_at timestamptz);
      create table fb_pending_profiles(email text primary key);
      create table fb_documents(id uuid primary key);
      create table fb_progress(user_id uuid references fb_profiles, content_id uuid references fb_documents, version integer, lessons jsonb, attempts jsonb, primary key(user_id,content_id,version));
      create table fb_feedback(id int primary key, content_id uuid references fb_documents);
      insert into fb_config values(true, 42, '[{"id":"group"}]', '[{"id":"team"}]', '[{"id":"curriculum"}]');
      insert into fb_profiles select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid, 'Person '||i, 'person'||i||'@example.test', case when i=1 then 'admin' else 'learner' end, true, null from generate_series(1,600) i;
      insert into fb_documents select ('00000000-0000-4000-9000-' || lpad(i::text,12,'0'))::uuid from generate_series(1,50) i;
      insert into fb_progress select p.id,d.id,1,'["lesson-1"]','[{"passed":false,"answers":[{"correct":false}]}]' from fb_profiles p cross join fb_documents d;
      insert into fb_progress select user_id,content_id,2,lessons,attempts from fb_progress where user_id='${id(2)}';
      insert into fb_feedback select i, (select id from fb_documents order by id limit 1) from generate_series(1,600) i;
      insert into fb_pending_profiles values('pending@example.test');
      grant select on all tables in schema public to service_role;
    `);
    const fingerprint = async () =>
      (
        await pg.query(
          "select md5(string_agg(row::text,'' order by row::text)) hash from (select jsonb_build_object('u',user_id,'c',content_id,'v',version,'l',lessons,'a',attempts) row from fb_progress) p",
        )
      ).rows;
    const before = await fingerprint();
    await pg.transaction(async (tx) => {
      await tx.exec(migration);
    });
    assert.deepEqual(await fingerprint(), before);
    const plan = await pg.query<{ "QUERY PLAN": string }>("explain select user_id from fb_progress where content_id = (select id from fb_documents order by id limit 1)");
    assert.ok(plan.rows.some((row) => row["QUERY PLAN"].includes("fb_progress_content_id_idx")));

    await pg.exec("set role service_role");
    const read = async (person: string | null = null) =>
      (
        await pg.query<{ data: any }>(
          "select fb_admin_people_snapshot($1,$2) data",
          [admin.id, person],
        )
      ).rows[0].data;
    const people = await read();
    assert.equal(people.users.length, 600);
    assert.equal(people.users[599].id, id(600));
    assert.equal(people.revision, 42);
    assert.deepEqual(people.curricula, [{ id: "curriculum" }]);
    assert.equal(people.pending.length, 1);
    assert.deepEqual(people.progress, []);
    const person = await read(id(2));
    assert.equal(person.progress.length, 100);
    assert.ok(person.progress.every((row: any) => row.user_id === id(2)));
    assert.equal(person.progress[0].attempts[0].answers[0].correct, false);
    await assert.rejects(
      pg.query("select fb_admin_people_snapshot($1)", [id(2)]),
      /Administrator/,
    );
    await assert.rejects(read(id(999)), /no longer available/);
    await pg.exec(
      "reset role; update fb_profiles set active=false where id='" +
        admin.id +
        "'; set role service_role",
    );
    await assert.rejects(read(), /Administrator/);
    await pg.exec(
      "reset role; update fb_profiles set active=true,deleted_at=now() where id='" +
        admin.id +
        "'; set role service_role",
    );
    await assert.rejects(read(), /Administrator/);
    await pg.exec("reset role; set role anon");
    await assert.rejects(read(), /permission denied/);
    await pg.exec("reset role; set role authenticated");
    await assert.rejects(read(), /permission denied/);
    await pg.exec("reset role");
    const indexes = await pg.query<{ indexname: string }>(
      "select indexname from pg_indexes where indexname in ('fb_progress_content_id_idx','fb_feedback_content_id_idx')",
    );
    assert.equal(indexes.rows.length, 2);
  } finally {
    await pg.close();
  }
});

test("People API snapshot starts independent reads together and never reads report bodies or housekeeping", async () => {
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://admin-contract.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: admin.email,
    FIELDBOOK_HOST: "node",
  });
  const paths: string[] = [];
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    release = resolve;
  });
  const users = Array.from({ length: 600 }, (_, n) => ({
    ...admin,
    id: id(n + 1),
    role: n ? "learner" : "admin",
  }));
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "admin-contract.supabase.co");
    paths.push(url.pathname);
    if (paths.length === 3) release();
    await started;
    if (url.pathname.endsWith("/fb_config"))
      return Response.json({
        settings: defaultSettings,
        revision: 1,
        governance_revision: 9,
        groups: [],
        curricula: [],
      });
    if (url.pathname.endsWith("/fb_admin_people_snapshot"))
      return Response.json({
        users,
        groups: [],
        teams: [],
        pending: [],
        progress: [],
        revision: 9,
      });
    if (url.pathname.endsWith("/fb_documents")) {
      assert.ok(
        url.searchParams.get("select")?.includes("title:draft->>title"),
      );
      return Response.json([], { headers: { "Content-Range": "*/0" } });
    }
    throw new Error("Unexpected read: " + url.pathname);
  };
  try {
    const people = await adminSnapshot(admin, "people");
    assert.equal(people.users.length, 600);
    assert.deepEqual(people.progress, {});
    assert.equal(people.deletedItems, undefined);
    assert.equal(paths.length, 3);
    await assert.rejects(
      adminSnapshot({ ...admin, role: "learner" }, "people"),
      /Administrator/,
    );
    assert.equal(paths.length, 3);
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
});
