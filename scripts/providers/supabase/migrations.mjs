import { setupGuardSql } from "../../setup-database.mjs";
import {
  pendingSelfHostedMigrations,
  selfHostedMigration,
  SelfHostedSetupError,
} from "./self-hosted.mjs";

const lockId = 686271842;

async function installationState(client) {
  const {
    rows: [state],
  } = await client.query(`SELECT
    to_regclass('auth.users') IS NOT NULL AND
      to_regclass('storage.buckets') IS NOT NULL AND
      to_regclass('storage.objects') IS NOT NULL AND
      to_regnamespace('extensions') IS NOT NULL AS ready,
    to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS ledger,
    to_regclass('public.fb_config') IS NOT NULL AS installed,
    to_regclass('public.fb_profiles') IS NOT NULL AND
      to_regclass('public.fb_documents') IS NOT NULL AND
      to_regclass('public.fb_progress') IS NOT NULL AND
      to_regclass('public.fb_media') IS NOT NULL AND
      to_regclass('public.fb_mcp_grants') IS NOT NULL AND
      to_regclass('public.fb_cleanup_config') IS NOT NULL AS application`);
  if (!state.ready) {
    throw new SelfHostedSetupError(
      "Finish configuring Supabase Auth and Storage before Fieldbook database setup or upgrade.",
    );
  }
  const applied = state.ledger
    ? (
        await client.query(
          "SELECT version::text FROM supabase_migrations.schema_migrations ORDER BY version::text",
        )
      ).rows.map(({ version }) => version)
    : [];
  return { ...state, applied };
}

async function cleanupConfiguration(client) {
  const { rows } = await client.query(`SELECT
    jsonb_build_array(endpoint, secret)::text AS connection
    FROM public.fb_cleanup_config WHERE id = true
      AND endpoint IS NOT NULL AND length(secret) >= 32`);
  if (rows.length !== 1) {
    throw new SelfHostedSetupError(
      "The existing cleanup endpoint and worker credential must be configured before an upgrade.",
    );
  }
  return rows[0].connection;
}

async function verifyInstallation(client) {
  const {
    rows: [verified],
  } = await client.query(`SELECT
    (SELECT count(*) = 1 FROM public.fb_config WHERE id = true) AND
    EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'fieldbook-media' AND public = false)
    AS valid`);
  if (!verified.valid) {
    throw new SelfHostedSetupError(
      "Fieldbook configuration or the private media bucket is missing.",
    );
  }
}

/** The client must be a dedicated admin connection, not a transaction pool.
 * The advisory lock serializes this command; it does not stop application writes.
 * A dry run inspects history/guards only and never executes pending migration SQL. */
export async function runSelfHostedMigrations(
  client,
  { migrations, upgrade = false, dryRun = false, origin = "" },
) {
  // Validate release files before opening a transaction or changing any schema.
  pendingSelfHostedMigrations(migrations, [], false);
  const prepared = migrations.map((migration) => ({
    ...migration,
    sql: selfHostedMigration(migration.source, migration.filename),
  }));
  if (!upgrade && !origin) {
    throw new SelfHostedSetupError(
      "Fresh setup requires the canonical HTTPS Fieldbook origin.",
    );
  }
  await client.query(dryRun ? "BEGIN READ ONLY" : "BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '5min'");
    await client.query(`SELECT pg_advisory_xact_lock(${lockId})`);
    const state = await installationState(client);
    const pending = pendingSelfHostedMigrations(
      prepared,
      state.applied,
      upgrade,
    );
    let cleanupBefore;
    if (upgrade) {
      if (!state.installed || !state.application) {
        throw new SelfHostedSetupError(
          "The migration ledger does not describe a complete Fieldbook installation. Review the database before upgrading.",
        );
      }
      await verifyInstallation(client);
      cleanupBefore = await cleanupConfiguration(client);
    } else {
      await client.query(
        setupGuardSql(prepared.map(({ filename }) => filename.split("_")[0])),
      );
      const {
        rows: [used],
      } = await client.query(`SELECT
        EXISTS (SELECT 1 FROM auth.users) OR EXISTS (SELECT 1 FROM storage.objects) AS used`);
      if (used.used) {
        throw new SelfHostedSetupError(
          "Fresh setup refuses a backend with accounts or stored objects. Use --upgrade for an existing Fieldbook installation.",
        );
      }
      if (!state.installed && state.applied.length) {
        throw new SelfHostedSetupError(
          "Migration history exists without an application schema. Review the database; do not replay the baseline.",
        );
      }
    }
    if (dryRun) {
      await client.query("ROLLBACK");
      return {
        applied: state.applied,
        pending: pending.map(({ filename }) => filename),
        dryRun: true,
      };
    }
    if (!state.installed) {
      await client.query(
        "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions",
      );
      await client.query(`CREATE SCHEMA IF NOT EXISTS supabase_migrations;
        CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY, statements text[], name text);
        REVOKE ALL ON SCHEMA supabase_migrations FROM public, anon, authenticated, service_role;
        REVOKE ALL ON supabase_migrations.schema_migrations FROM public, anon, authenticated, service_role`);
    }
    for (const { filename, sql } of pending) {
      await client.query(sql);
      await client.query(
        "INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES($1,$2)",
        [filename.split("_")[0], filename.replace(/^\d+_|\.sql$/g, "")],
      );
    }
    if (!upgrade) {
      await client.query(
        "UPDATE public.fb_cleanup_config SET endpoint=$1 WHERE id=true",
        [`${origin}/api/internal/purge-deleted`],
      );
    }
    await verifyInstallation(client);
    const cleanupAfter = await cleanupConfiguration(client);
    if (upgrade && cleanupAfter !== cleanupBefore) {
      throw new SelfHostedSetupError(
        "A pending migration changed the external cleanup endpoint or credential. The transaction was rolled back; this needs a reviewed scheduling update.",
      );
    }
    const { rows: versions } = await client.query(
      "SELECT version::text FROM supabase_migrations.schema_migrations ORDER BY version::text",
    );
    if (
      versions.map(({ version }) => version).join(",") !==
      prepared.map(({ filename }) => filename.split("_")[0]).join(",")
    ) {
      throw new SelfHostedSetupError(
        "Migration history changed unexpectedly. The transaction was rolled back.",
      );
    }
    if (pending.length || !upgrade)
      await client.query("SELECT pg_notify('pgrst', 'reload schema')");
    await client.query("COMMIT");
    return {
      applied: state.applied,
      pending: pending.map(({ filename }) => filename),
      dryRun: false,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
