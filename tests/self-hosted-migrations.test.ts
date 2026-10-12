import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import {
  baselineFilename,
  baselineSha256,
  pendingSelfHostedMigrations,
  selfHostedConnectionOptions,
  selfHostedMigration,
} from "../scripts/providers/supabase/self-hosted.mjs";
import { runSelfHostedMigrations } from "../scripts/providers/supabase/migrations.mjs";

const { Client } = createRequire(import.meta.url)("pg") as {
  Client: new (options: ReturnType<typeof selfHostedConnectionOptions>) => {
    ssl: unknown;
  };
};

const source = readFileSync(
  new URL(`../supabase/migrations/${baselineFilename}`, import.meta.url),
  "utf8",
);
const baseline = { filename: baselineFilename, source };
const version = "20261006061752";
const origin = "https://learning.example.test";
// This is a synthetic pending migration, never a repository schema change.
const addition = {
  filename: "20261013000000_contract_test.sql",
  source:
    "begin;\ncreate table public.fb_update_probe(id integer primary key); insert into public.fb_update_probe values(7);\ncommit;\n",
};

function client(database: PGlite, calls: string[] = []) {
  return {
    async query(sql: string, args?: unknown[]) {
      calls.push(sql);
      return args
        ? database.query(sql, args)
        : (await database.exec(sql)).at(-1) || { rows: [] };
    },
  };
}

async function backend(dataDir?: string) {
  // Vendor tables are substitutes. The Fieldbook baseline and PostgreSQL
  // pgcrypto/pg_trgm extensions execute as shipped through the actual runner.
  const database = new PGlite({ dataDir, extensions: { pg_trgm, pgcrypto } });
  await database.exec(`
    create role anon; create role authenticated;
    create role service_role bypassrls; create role supabase_auth_admin;
    create schema auth; create table auth.users(id uuid primary key);
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text,name text);
    create schema extensions;
  `);
  return database;
}

async function seed(database: PGlite) {
  await database.exec(`
    insert into auth.users values('00000000-0000-4000-8000-000000000001');
    insert into public.fb_profiles(id,auth_user_id,name,email,role,active)
      values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Synthetic administrator','admin@example.test','admin',true);
    insert into public.fb_documents(id,draft,published,published_revision)
      values('00000000-0000-4000-8000-000000000002','{"kind":"course","title":"Saved draft","version":1,"lessons":[]}',
      '{"kind":"course","title":"Saved course","version":1,"lessons":[]}',1);
    insert into public.fb_progress(user_id,content_id,version,lessons,passed,attempts)
      values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',1,'["lesson"]',true,'[{"passed":true}]');
    insert into public.fb_mcp_grants(user_id,client_id,client_name)
      values('00000000-0000-4000-8000-000000000001','synthetic-client','Synthetic client');
    insert into public.fb_media(id,path,filename,mime,bytes,owner,ready)
      values('00000000-0000-4000-8000-000000000003','saved/image.png','image.png','image/png',100,'00000000-0000-4000-8000-000000000001',true);
    insert into storage.objects values('00000000-0000-4000-8000-000000000003','fieldbook-media','saved/image.png');
    update storage.buckets set file_size_limit=500000 where id='fieldbook-media';
    insert into public.fb_oauth_config(id,resource) values(true,'${origin}/api/mcp');
    update public.fb_cleanup_config set last_run='2026-10-12T10:00:00Z';
  `);
}

async function snapshot(database: PGlite) {
  const tables = [
    "auth.users",
    "storage.buckets",
    "storage.objects",
    "public.fb_profiles",
    "public.fb_documents",
    "public.fb_progress",
    "public.fb_mcp_grants",
    "public.fb_media",
    "public.fb_config",
    "public.fb_oauth_config",
    "public.fb_cleanup_config",
  ];
  const saved: Record<string, unknown> = {};
  for (const table of tables)
    saved[table] = (
      await database.query(
        `select row_to_json(t) record from ${table} t order by row_to_json(t)::text`,
      )
    ).rows;
  saved.privileges = (
    await database.query(
      `select relname, relrowsecurity, relacl::text from pg_class where relname in ('fb_profiles','fb_documents','fb_cleanup_config','fb_mcp_grants') order by relname`,
    )
  ).rows;
  return saved;
}

test("self-hosted adaptation pins the exact immutable released baseline bytes", () => {
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    baselineSha256,
  );
  assert.throws(
    () => selfHostedMigration(source + "\n", baselineFilename),
    /baseline bytes/,
  );
  const rendered = selfHostedMigration(source, baselineFilename);
  assert.match(rendered, /pg_trgm with schema extensions/);
  assert.doesNotMatch(rendered, /pg_cron|pg_net|cron\.schedule|net\.http_post/);
});

test("connection URL SSL parameters cannot disable certificate verification or replace the CA", () => {
  for (const ssl of [
    "ssl=false",
    "sslmode=no-verify",
    "sslmode=require",
    "sslmode=disable&sslcert=/bad&sslkey=/bad&sslrootcert=/bad&uselibpqcompat=true",
    "SSLmode=disable&ssl=false&ssl=true",
  ]) {
    const options = selfHostedConnectionOptions(
      `postgresql://operator:synthetic@db.example.test:25060/fieldbook?${ssl}&application_name=fieldbook`,
      "test-ca",
    );
    const parsed = new URL(options.connectionString);
    assert.deepEqual(
      [...parsed.searchParams],
      [["application_name", "fieldbook"]],
    );
    assert.deepEqual(options.ssl, { rejectUnauthorized: true, ca: "test-ca" });
    const connection = new Client(options);
    assert.deepEqual(connection.ssl, options.ssl);
  }
  assert.throws(
    () => selfHostedConnectionOptions("https://db.example.test"),
    /PostgreSQL/,
  );
});

test("migration planning requires a complete ordered prefix and unique release files", () => {
  const release = [
    baseline,
    addition,
    { filename: "20261014000000_next.sql", source: "select 1;" },
  ];
  assert.deepEqual(
    pendingSelfHostedMigrations(release, [version], true),
    release.slice(1),
  );
  for (const applied of [
    [],
    ["20261005000000"],
    [version, "20261014000000"],
    [version, "20261013000000", "20261014000000", "20261015000000"],
  ]) {
    assert.throws(
      () => pendingSelfHostedMigrations(release, applied, true),
      /ledger|prefix/,
    );
  }
  for (const files of [
    [addition],
    [baseline, addition, addition],
    [baseline, { filename: "unexpected.sql" }],
    [addition, baseline],
  ]) {
    assert.throws(
      () => pendingSelfHostedMigrations(files, [], false),
      /release order/,
    );
  }
});

test("unreviewed extensions, scheduling, and transaction boundaries fail closed", () => {
  for (const sql of [
    'SELECT "net" . http_post();',
    "SELECT CRON.schedule();",
    "CREATE EXTENSION pg_net;",
    "alter extension pg_trgm update;",
    "create extension if not exists unknown;",
    "drop extension pgcrypto;",
    "begin; select 1;",
    "select 1; commit;",
    "begin; select 1; commit; select 2; commit;",
    "savepoint partial;",
    "create /* compatibility */ extension unknown;",
    "abort;",
    "select 'backslash\\'; commit; select 'hidden transaction';",
    "set standard_conforming_strings=off;",
  ])
    assert.throws(
      () => selfHostedMigration(sql, addition.filename),
      /reviewed/,
    );
  assert.equal(
    selfHostedMigration(
      "-- migration\nbegin;\nselect 'begin; commit;';\ncommit;",
      addition.filename,
    ).trim(),
    "select 'begin; commit;';",
  );
  assert.match(
    selfHostedMigration(
      "begin;\ncreate function public.fb_test() returns void language plpgsql as $$begin return; end$$;\ncommit;",
      addition.filename,
    ),
    /begin return/,
  );
  assert.match(
    selfHostedMigration(
      "/* outer /* nested */ comment */ begin;\ncreate function public.fb_test() returns void language plpgsql as $outer$ begin perform '$inner$'; return; end $outer$;\ncommit;",
      addition.filename,
    ),
    /\$outer\$/,
  );
});

test("fresh self-hosted setup supports read-only planning and refuses configured or used targets", async () => {
  const database = await backend();
  try {
    const calls: string[] = [];
    const connection = client(database, calls);
    assert.deepEqual(
      (
        await runSelfHostedMigrations(connection, {
          migrations: [baseline],
          origin,
          dryRun: true,
        })
      ).pending,
      [baselineFilename],
    );
    assert.equal(
      (
        await database.query<{ ledger: string | null }>(
          "select to_regclass('supabase_migrations.schema_migrations') ledger",
        )
      ).rows[0].ledger,
      null,
    );
    assert.equal(calls[0], "BEGIN READ ONLY");
    await database.exec(
      "insert into auth.users values('00000000-0000-4000-8000-000000000001')",
    );
    await assert.rejects(
      runSelfHostedMigrations(connection, { migrations: [baseline], origin }),
      /accounts or stored objects/,
    );
    await database.exec("delete from auth.users");
    await database.exec(
      "insert into storage.objects values('00000000-0000-4000-8000-000000000003','synthetic','stored')",
    );
    await assert.rejects(
      runSelfHostedMigrations(connection, { migrations: [baseline], origin }),
      /accounts or stored objects/,
    );
    await database.exec("delete from storage.objects");
    await runSelfHostedMigrations(connection, {
      migrations: [baseline],
      origin,
    });
    assert.deepEqual(
      (
        await database.query(
          "select version,name from supabase_migrations.schema_migrations",
        )
      ).rows,
      [{ version, name: "initial_install" }],
    );
    assert.equal(
      (
        await database.query<{ secret: string }>(
          "select secret from public.fb_cleanup_config",
        )
      ).rows[0].secret.length,
      64,
    );
    assert.deepEqual(
      (await database.query("select endpoint from public.fb_cleanup_config"))
        .rows,
      [{ endpoint: `${origin}/api/internal/purge-deleted` }],
    );
    await assert.rejects(
      runSelfHostedMigrations(connection, { migrations: [baseline], origin }),
      /already configured/,
    );
  } finally {
    await database.close();
  }
});

test("pending updates preserve existing accounts, content, progress, MCP grants, private media and cleanup across database reopen", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-migrations-"));
  let database = await backend(directory);
  try {
    await runSelfHostedMigrations(client(database), {
      migrations: [baseline],
      origin,
    });
    await seed(database);
    const before = await snapshot(database);
    const calls: string[] = [];
    const connection = client(database, calls);
    const preview = await runSelfHostedMigrations(connection, {
      migrations: [baseline, addition],
      upgrade: true,
      dryRun: true,
    });
    assert.deepEqual(preview.pending, [addition.filename]);
    assert.deepEqual(await snapshot(database), before);
    assert.equal(
      (
        await database.query<{ table: string | null }>(
          "select to_regclass('public.fb_update_probe') as table",
        )
      ).rows[0].table,
      null,
    );
    await runSelfHostedMigrations(connection, {
      migrations: [baseline, addition],
      upgrade: true,
    });
    assert.deepEqual(await snapshot(database), before);
    assert.deepEqual(
      (
        await database.query(
          "select version from supabase_migrations.schema_migrations order by version",
        )
      ).rows,
      [{ version }, { version: "20261013000000" }],
    );
    assert.deepEqual(
      (await database.query("select * from public.fb_update_probe")).rows,
      [{ id: 7 }],
    );
    assert.ok(
      calls.indexOf("SELECT pg_advisory_xact_lock(686271842)") <
        calls.indexOf(selfHostedMigration(addition.source, addition.filename)),
    );
    await database.close();
    database = new PGlite({
      dataDir: directory,
      extensions: { pg_trgm, pgcrypto },
    });
    assert.deepEqual(await snapshot(database), before);
    const repeated = await runSelfHostedMigrations(client(database), {
      migrations: [baseline, addition],
      upgrade: true,
    });
    assert.deepEqual(repeated.pending, []);
    assert.deepEqual(await snapshot(database), before);
  } finally {
    await database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a failing update rolls back all pending SQL and migration history", async () => {
  const database = await backend();
  try {
    await runSelfHostedMigrations(client(database), {
      migrations: [baseline],
      origin,
    });
    await seed(database);
    const before = await snapshot(database);
    const failing = {
      filename: "20261014000000_failure.sql",
      source:
        "update public.fb_profiles set name='Changed'; select public.no_such_function();",
    };
    await assert.rejects(
      runSelfHostedMigrations(client(database), {
        migrations: [baseline, addition, failing],
        upgrade: true,
      }),
      /no_such_function/,
    );
    assert.deepEqual(await snapshot(database), before);
    assert.deepEqual(
      (
        await database.query(
          "select version from supabase_migrations.schema_migrations",
        )
      ).rows,
      [{ version }],
    );
    assert.equal(
      (
        await database.query<{ table: string | null }>(
          "select to_regclass('public.fb_update_probe') as table",
        )
      ).rows[0].table,
      null,
    );
  } finally {
    await database.close();
  }
});

test("upgrades refuse cleanup changes and damaged migration history without losing records", async () => {
  const database = await backend();
  try {
    await runSelfHostedMigrations(client(database), {
      migrations: [baseline],
      origin,
    });
    await seed(database);
    const before = await snapshot(database);
    for (const change of [
      "endpoint='https://wrong.example.test/cleanup'",
      "secret=repeat('a',64)",
      "endpoint=null",
    ]) {
      await assert.rejects(
        runSelfHostedMigrations(client(database), {
          migrations: [
            baseline,
            {
              ...addition,
              source: `update public.fb_cleanup_config set ${change};`,
            },
          ],
          upgrade: true,
        }),
        /cleanup|credential/,
      );
      assert.deepEqual(await snapshot(database), before);
    }
    await database.exec("delete from supabase_migrations.schema_migrations");
    await assert.rejects(
      runSelfHostedMigrations(client(database), {
        migrations: [baseline, addition],
        upgrade: true,
      }),
      /ledger/,
    );
    await database.exec(
      `insert into supabase_migrations.schema_migrations(version) values('${version}'),('20261014000000')`,
    );
    await assert.rejects(
      runSelfHostedMigrations(client(database), {
        migrations: [baseline, addition],
        upgrade: true,
      }),
      /prefix/,
    );
    assert.deepEqual(await snapshot(database), before);
  } finally {
    await database.close();
  }
});
