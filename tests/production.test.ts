import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { contentSchema, settingsSchema } from "../server/schemas";
import { videoSource } from "../lib/video";
import { guestAnswersForImport, guestSelectionsForImport } from "../lib/guest-progress";

test("guest import preserves a passing answer set after a failed retake", () => {
  const old = {
    content_id: "course",
    version: 1,
    lessons: ["one"],
    passed: true,
    guestAnswers: [1, 0],
    guestSelections: [[1], [0]],
  };
  assert.deepEqual(guestAnswersForImport(old, [0, 0], false), [1, 0]);
  assert.deepEqual(guestAnswersForImport(old, undefined, undefined), [1, 0]);
  assert.deepEqual(guestAnswersForImport(old, [1, 1], true), [1, 1]);
  assert.deepEqual(guestSelectionsForImport(old, [[0], [0]], false), [[1], [0]]);
  assert.deepEqual(guestSelectionsForImport(old, [[1], [1]], true), [[1], [1]]);
});

test("production content rejects duplicate lesson ids and unsafe branding", () => {
  const c = {
    id: crypto.randomUUID(),
    kind: "course",
    title: "Course",
    summary: "",
    body: "",
    category: "General",
    folder: "",
    status: "draft",
    version: 1,
    updatedAt: new Date().toISOString(),
    duration: 5,
    groups: [],
    lessons: [
      { id: "one", title: "One", body: "Hello" },
      { id: "one", title: "Two", body: "Hello" },
    ],
    questions: [],
  };
  assert.equal(contentSchema.safeParse(c).success, false);
  assert.equal(
    settingsSchema.safeParse({
      name: "Site",
      tagline: "",
      accent: "red;display:none",
      access: "public",
      registration: "open",
    }).success,
    false,
  );
  assert.deepEqual(
    videoSource("/api/media/00000000-0000-4000-8000-000000000001.mp4"),
    {
      type: "file",
      url: "/api/media/00000000-0000-4000-8000-000000000001.mp4",
    },
  );
});

test("database migrations preserve drafts, enforce revisions, isolate browser access, and merge progress", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      "create role anon;create role authenticated;create role service_role;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    );
    for (const name of [
      "202609190001_fieldbook.sql",
      "202609190002_mcp_audience.sql",
    ])
      await pg.exec(
        await readFile(
          new URL(`../supabase/history/initial-development/${name}`, import.meta.url),
          "utf8",
        ),
      );
    const id = crypto.randomUUID(),
      user = crypto.randomUUID(),
      other = crypto.randomUUID();
    await pg.query("insert into auth.users(id) values($1),($2)", [user, other]);
    const save = async (expected: number, title: string, publish: boolean) =>
      pg.query<any>(
        "select * from public.fb_save_document($1,$2,$3::jsonb,$4,false,$5,'test')",
        [
          id,
          expected,
          JSON.stringify({ id, title, version: 1 }),
          publish,
          user,
        ],
      );
    const one = await save(0, "First public version", true);
    assert.equal(one.rows[0].revision, 1);
    const two = await save(1, "Work in progress", false);
    assert.equal(two.rows[0].published.title, "First public version");
    assert.equal(two.rows[0].draft.title, "Work in progress");
    await assert.rejects(save(1, "Stale overwrite", true), /Revision conflict/);
    const published = await save(2, "Reviewed version", true);
    assert.equal(published.rows[0].published.title, "Reviewed version");
    const progress = async (uid: string, lessons: string[], passed: boolean) =>
      pg.query<any>(
        "select * from public.fb_record_progress($1,$2,1,$3::jsonb,$4,null)",
        [uid, id, JSON.stringify(lessons), passed],
      );
    await progress(user, ["one"], true);
    const merged = await progress(user, ["two"], false);
    assert.equal(merged.rows[0].passed, true);
    assert.deepEqual([...merged.rows[0].lessons].sort(), ["one", "two"]);
    const otherP = await progress(other, ["one"], false);
    assert.equal(otherP.rows[0].passed, false);
    await pg.exec("set role anon");
    await assert.rejects(
      pg.query("select * from public.fb_documents"),
      /permission denied/,
    );
    await pg.exec("reset role;set role authenticated");
    await assert.rejects(save(3, "Unauthorized", true), /permission denied/);
    await pg.exec("reset role");
    const audit = await pg.query<any>(
      "select count(*)::int as n from public.fb_audit",
    );
    assert.equal(audit.rows[0].n, 3);
    const allow = async () =>
      pg.query<any>("select public.fb_allow_request('test',2,60) as allowed");
    assert.equal((await allow()).rows[0].allowed, true);
    assert.equal((await allow()).rows[0].allowed, true);
    assert.equal((await allow()).rows[0].allowed, false);
    await pg.query(
      "insert into public.fb_oauth_config(id,resource) values(true,'https://fieldbook.example/api/mcp')",
    );
    await pg.query(
      "insert into public.fb_mcp_grants(user_id,client_id,client_name) values($1,'client-1','Test client')",
      [user],
    );
    const hook = async () =>
      pg.query<any>("select public.fb_access_token_hook($1::jsonb) as result", [
        JSON.stringify({
          user_id: user,
          client_id: "client-1",
          claims: { sub: user, aud: "authenticated", client_id: "client-1" },
        }),
      ]);
    assert.equal(
      (await hook()).rows[0].result.claims.aud,
      "https://fieldbook.example/api/mcp",
    );
    await pg.query(
      "update public.fb_mcp_grants set enabled=false where user_id=$1",
      [user],
    );
    assert.equal((await hook()).rows[0].result.claims.aud, "authenticated");
  } finally {
    await pg.close();
  }
});
