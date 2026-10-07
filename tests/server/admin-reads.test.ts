import assert from "node:assert/strict";
import test from "node:test";
import { defaultSettings } from "../../lib/settings";
import type { User } from "../../lib/types";
import { adminSnapshot } from "../../server/admin-snapshot";
import { database } from "../helpers/database.mjs";

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

test("People reads preserve data, return all registered/pending accounts, scope complete history and reject unauthorized callers", async () => {
  const pg = await database();
  try {
    await pg.exec(`
      update fb_config set governance_revision=42, groups='[{"id":"group","name":"Group"}]',curricula='[{"id":"curriculum"}]';
      insert into auth.users(id) select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,600)i;
      insert into fb_profiles(id,auth_user_id,name,email,role) select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Person '||i,'person'||i||'@example.test',case when i=1 then 'admin' else 'learner' end from generate_series(1,600)i;
      insert into fb_profiles(id,name,email) values('${id(601)}','Pending','pending@example.test');
      insert into fb_documents(id,draft,published,published_revision) select ('00000000-0000-4000-9000-'||lpad(i::text,12,'0'))::uuid,jsonb_build_object('kind','course','title','Course '||i,'version',1,'lessons','[]'::jsonb),jsonb_build_object('kind','course','title','Course '||i,'version',1,'lessons','[]'::jsonb),1 from generate_series(1,50)i;
      insert into fb_progress(user_id,content_id,version,lessons,attempts) select p.id,d.id,1,'["lesson-1"]','[{"passed":false,"answers":[{"correct":false}]}]' from fb_profiles p cross join fb_documents d where p.auth_user_id is not null;
      insert into fb_progress select user_id,content_id,2,lessons,passed,attempts,revision from fb_progress where user_id='${id(2)}';
      insert into fb_feedback(id,user_id,content_id,version,rating,comment) select gen_random_uuid(),('${id(1)}')::uuid,(select id from fb_documents order by id limit 1),1,'up','Feedback' from generate_series(1,600)i;
    `);
    const fingerprint = async () =>
      (
        await pg.query(
          "select md5(string_agg(row::text,'' order by row::text)) hash from (select jsonb_build_object('u',user_id,'c',content_id,'v',version,'l',lessons,'a',attempts) row from fb_progress) p",
        )
      ).rows;
    const before = await fingerprint();
    const plan = await pg.query<{ "QUERY PLAN": string }>(
      "explain select user_id from fb_progress where content_id = (select id from fb_documents order by id limit 1)",
    );
    assert.ok(
      plan.rows.some((row) =>
        row["QUERY PLAN"].includes("fb_progress_content_id_idx"),
      ),
    );

    await pg.exec("set role service_role");
    const read = async (person: string | null = null) =>
      (
        await pg.query<{ data: any }>(
          "select fb_admin_people_snapshot($1,$2) data",
          [admin.id, person],
        )
      ).rows[0].data;
    const people = await read();
    assert.equal(people.users.length, 601);
    assert.equal(people.users[599].id, id(600));
    assert.equal(people.revision, 42);
    assert.deepEqual(people.curricula, [{ id: "curriculum" }]);
    assert.equal(people.pending.length, 0);
    assert.equal(people.users[600].auth_user_id, null);
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
    assert.deepEqual(await fingerprint(), before);
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
