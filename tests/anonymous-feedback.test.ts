import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { feedbackRows } from "../lib/reporting";
import { freshWorkspace } from "../lib/store";

test("administrator feedback labels anonymous submissions as guest visitors", () => {
  const workspace = freshWorkspace();
  const content = workspace.content[0];
  workspace.feedback = [
    {
      id: crypto.randomUUID(),
      userId: "guest",
      contentId: content.id,
      version: content.version,
      rating: "up",
      comment: "Helpful",
      updatedAt: "2026-09-24T00:00:00.000Z",
    },
  ];
  assert.equal(feedbackRows(workspace)[0].person, "Guest visitor");
});

test("anonymous feedback migration preserves account rows and isolates guest identity", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      "create role anon;create role authenticated;create role service_role;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    );
    await pg.exec(
      await readFile(
        new URL("../supabase/migrations/202609190001_fieldbook.sql", import.meta.url),
        "utf8",
      ),
    );
    const userId = crypto.randomUUID();
    const contentId = crypto.randomUUID();
    await pg.query("insert into auth.users(id) values($1)", [userId]);
    await pg.query(
      "insert into public.fb_documents(id,draft,published) values($1,'{}','{}')",
      [contentId],
    );
    await pg.query(
      "insert into public.fb_feedback(id,user_id,content_id,version,rating,comment) values($1,$2,$3,1,'up','Account response')",
      [crypto.randomUUID(), userId, contentId],
    );
    await pg.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20260924150351_anonymous_feedback.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const guestKey = "a".repeat(64);
    await pg.query(
      "insert into public.fb_feedback(id,guest_key,content_id,version,rating,comment) values($1,$2,$3,1,'down','Guest response')",
      [crypto.randomUUID(), guestKey, contentId],
    );
    await pg.query(
      "insert into public.fb_feedback(id,guest_key,content_id,version,rating,comment) values($1,$2,$3,1,'up','Updated') on conflict(guest_key,content_id) do update set rating=excluded.rating,comment=excluded.comment",
      [crypto.randomUUID(), guestKey, contentId],
    );
    const result = await pg.query<{
      user_id: string | null;
      guest_key: string | null;
      comment: string;
    }>("select user_id,guest_key,comment from public.fb_feedback order by comment");
    assert.deepEqual(
      result.rows.map((row) => [row.user_id, row.guest_key, row.comment]),
      [
        [userId, null, "Account response"],
        [null, guestKey, "Updated"],
      ],
    );
    await assert.rejects(
      pg.query(
        "insert into public.fb_feedback(id,content_id,version,rating,comment) values($1,$2,1,'up','Invalid')",
        [crypto.randomUUID(), contentId],
      ),
    );
    await assert.rejects(
      pg.query(
        "insert into public.fb_feedback(id,user_id,guest_key,content_id,version,rating,comment) values($1,$2,$3,$4,1,'up','Invalid')",
        [crypto.randomUUID(), userId, "b".repeat(64), contentId],
      ),
    );
    await pg.exec("set role anon");
    await assert.rejects(pg.query("select * from public.fb_feedback"));
    await pg.exec("reset role");
  } finally {
    await pg.close();
  }
});
