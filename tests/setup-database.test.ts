import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { setupGuardSql } from "../scripts/setup-database.mjs";
import { selfHostedMigration } from "../scripts/providers/supabase/self-hosted.mjs";

const version = "20261006061752";
const guard = setupGuardSql([version]);

const authPreparation = readFileSync(
  new URL("../.do/prepare-supabase-backend.sql", import.meta.url),
  "utf8",
);
async function unusedSelfHostedAuth() {
  const database = new PGlite();
  await database.exec(`
    create role supabase_auth_admin;
    create role supabase_storage_admin;
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema storage;
    create table auth.users(id integer);
    create table auth.schema_migrations(version text primary key);
    create table public.schema_migrations(version text primary key);
    alter table public.schema_migrations owner to supabase_auth_admin;
    insert into public.schema_migrations values('20260121000000');
  `);
  return database;
}
test("self-hosted Auth preparation preserves vendor migration history in its own schema", async () => {
  const database = await unusedSelfHostedAuth();
  try {
    await database.exec(authPreparation);
    assert.deepEqual(
      (await database.query("select version from auth.schema_migrations")).rows,
      [{ version: "20260121000000" }],
    );
    assert.deepEqual(
      (
        await database.query(
          "select to_regclass('public.schema_migrations') ledger",
        )
      ).rows,
      [{ ledger: null }],
    );
    await database.exec(guard);
  } finally {
    await database.close();
  }
});
test("self-hosted Auth preparation refuses users and unrelated migration ledgers", async () => {
  for (const existing of [
    "insert into auth.users values(7)",
    "alter table public.schema_migrations owner to postgres",
    "insert into auth.schema_migrations values('20260101000000')",
  ]) {
    const database = await unusedSelfHostedAuth();
    try {
      await database.exec(existing);
      await assert.rejects(
        database.exec(authPreparation),
        /new, unused|Unexpected migration ledger/,
      );
      await database.exec("rollback");
      assert.deepEqual(
        (await database.query("select version from public.schema_migrations"))
          .rows,
        [{ version: "20260121000000" }],
      );
    } finally {
      await database.close();
    }
  }
});

test("self-hosted setup preserves the application baseline and delegates only HTTP scheduling", () => {
  const filename = "20261006061752_initial_install.sql";
  const source = readFileSync(
    new URL(`../supabase/migrations/${filename}`, import.meta.url),
    "utf8",
  );
  const rendered = selfHostedMigration(source, filename);
  assert.doesNotMatch(
    rendered,
    /create extension if not exists pg_(cron|net)|cron\.schedule|net\.http_post|^begin;|^commit;/m,
  );
  assert.match(rendered, /create table public\."fb_cleanup_config"/);
  assert.match(rendered, /fb_access_token_hook/);
  assert.match(rendered, /insert into storage\.buckets/);
  assert.throws(
    () =>
      selfHostedMigration(
        source.replace(
          "-- The installer connects this schedule to the deployed worker endpoint.",
          "-- Unknown scheduling section.",
        ),
        filename,
      ),
    /not recognized/,
  );
  assert.throws(
    () =>
      selfHostedMigration(
        "select net.http_post('https://example.test');",
        "20261013000000_schedule.sql",
      ),
    /reviewed self-hosted/,
  );
  assert.equal(
    selfHostedMigration(
      "begin;\nselect 1;\ncommit;\n",
      "20261013000000_example.sql",
    ).trim(),
    "select 1;",
  );
});

async function unfinishedProject() {
  const pg = new PGlite();
  await pg.exec(`
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key);
    insert into supabase_migrations.schema_migrations values('${version}');
    create table public.fb_config(id boolean primary key);
    insert into public.fb_config values(true);
    create table public.fb_cleanup_config(id boolean primary key, endpoint text);
    insert into public.fb_cleanup_config values(true, null);
    create table public.fb_profiles(id integer);
    create table public.fb_documents(id integer);
    create table public.fb_media(id integer);
  `);
  return pg;
}

test("fresh setup accepts an empty project and can finish a migrated unused project", async () => {
  const empty = new PGlite();
  const unfinished = await unfinishedProject();
  try {
    await empty.exec(guard);
    await unfinished.exec(guard);
    const result = await unfinished.query<{ endpoint: string | null }>(
      "select endpoint from public.fb_cleanup_config",
    );
    assert.equal(result.rows[0].endpoint, null);
  } finally {
    await empty.close();
    await unfinished.close();
  }
});

test("setup rejects unrelated or incomplete schemas without changing their data", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      "create table public.other_app(id integer); insert into public.other_app values(7)",
    );
    await assert.rejects(pg.exec(guard), /not an empty or unfinished/);
    assert.deepEqual((await pg.query("select id from public.other_app")).rows, [
      { id: 7 },
    ]);
  } finally {
    await pg.close();
  }
});

test("setup does not resume an installation with people, content or media", async () => {
  const pg = await unfinishedProject();
  try {
    for (const table of ["fb_profiles", "fb_documents", "fb_media"]) {
      await pg.exec(`insert into public.${table} values(1)`);
      await assert.rejects(
        pg.exec(guard),
        /already configured or contains records/,
      );
      assert.deepEqual(
        (await pg.query(`select id from public.${table}`)).rows,
        [{ id: 1 }],
      );
      await pg.exec(`delete from public.${table}`);
    }
  } finally {
    await pg.close();
  }
});

test("setup refuses a configured cleanup connection and mismatched migration history", async () => {
  const pg = await unfinishedProject();
  try {
    await pg.exec(
      "update public.fb_cleanup_config set endpoint='https://existing.example.test/cleanup'",
    );
    await assert.rejects(pg.exec(guard), /already configured/);
    assert.equal(
      (
        await pg.query<{ endpoint: string }>(
          "select endpoint from public.fb_cleanup_config",
        )
      ).rows[0].endpoint,
      "https://existing.example.test/cleanup",
    );
    await pg.exec(
      "update public.fb_cleanup_config set endpoint=null; insert into supabase_migrations.schema_migrations values('20261007000000')",
    );
    await assert.rejects(pg.exec(guard), /Migration history differs/);
  } finally {
    await pg.close();
  }
});

test("setup refuses other application tables alongside an unfinished Fieldbook", async () => {
  const pg = await unfinishedProject();
  try {
    await pg.exec("create table public.other_app(id integer)");
    await assert.rejects(pg.exec(guard), /contains another application/);
  } finally {
    await pg.close();
  }
});
