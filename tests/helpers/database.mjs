import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

export const baselineSql = readFileSync(
  new URL(
    "../../supabase/migrations/20261006061752_initial_install.sql",
    import.meta.url,
  ),
  "utf8",
);

const migrations = new URL("../../supabase/migrations/", import.meta.url);
export const pendingMigrationSql = readdirSync(migrations)
  .filter(
    (name) =>
      /^\d+_.+\.sql$/.test(name) && !name.endsWith("_initial_install.sql"),
  )
  .sort()
  .map((name) => readFileSync(new URL(name, migrations), "utf8"))
  .join("\n");

/** Current application schema, with only hosted provider services stubbed. */
export async function database({ baselineOnly = false } = {}) {
  const pg = new PGlite({ extensions: { pg_trgm } });
  try {
    await pg.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create role supabase_auth_admin;
    create schema auth;
    create table auth.users(id uuid primary key);
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create schema extensions;
    create function extensions.gen_random_bytes(integer) returns bytea language sql as 'select decode(repeat(''ab'',$1),''hex'')';
    create schema cron;
    create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,active boolean default true);
    create function cron.schedule(jobname text,schedule text,command text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values($1,$2,$3)
      on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command
      returning jobid;
    $$;
  `);
    // pg_cron/pg_net run only on hosted Supabase. The real preview rehearsal
    // verifies these services; local contract tests exercise the actual schema.
    await pg.exec(
      baselineSql.replace(
        /^create extension if not exists pg_(cron|net).*;\n/gm,
        "",
      ),
    );
    if (!baselineOnly && pendingMigrationSql)
      await pg.exec(pendingMigrationSql);
    return pg;
  } catch (error) {
    await pg.close();
    throw error;
  }
}

/** Synthetic stable identities; registration can be deferred until the login test. */
export async function seedProfile(pg, id, options = {}) {
  const registered = options.registered !== false;
  if (registered) await pg.query("insert into auth.users(id) values($1)", [id]);
  await pg.query(
    `insert into public.fb_profiles(id,auth_user_id,name,email,role,active,team_id)
    values($1,$2,$3,$4,$5,$6,$7)`,
    [
      id,
      registered ? id : null,
      options.name || "Synthetic person",
      options.email || id + "@example.test",
      options.role || "learner",
      options.active !== false,
      options.teamId || null,
    ],
  );
}
