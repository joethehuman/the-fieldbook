import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { setupGuardSql } from "../scripts/setup-database.mjs";

const version = "20261006061752";
const guard = setupGuardSql([version]);

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
