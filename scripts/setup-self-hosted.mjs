import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import pg from "pg";
import { setupGuardSql } from "./setup-database.mjs";
import { selfHostedMigration } from "./providers/supabase/self-hosted.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
async function main() {
  const connectionString = process.env.FIELDBOOK_SETUP_DATABASE_URL;
  const origin = new URL(process.env.FIELDBOOK_URL || "");
  if (
    !connectionString ||
    origin.protocol !== "https:" ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw new Error(
      "Set FIELDBOOK_SETUP_DATABASE_URL and the canonical HTTPS FIELDBOOK_URL.",
    );
  const database = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(database.protocol))
    throw new Error(
      "Use a PostgreSQL connection URL for the empty self-hosted backend.",
    );
  const caFile = process.env.FIELDBOOK_SETUP_DATABASE_CA;
  database.searchParams.delete("sslmode");
  const client = new pg.Client({
    connectionString: database.toString(),
    ssl: {
      rejectUnauthorized: true,
      ...(caFile ? { ca: readFileSync(caFile, "utf8") } : {}),
    },
  });
  const files = readdirSync(resolve(root, "supabase/migrations"))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  const versions = files.map((name) => name.split("_")[0]);
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    console.log(
      `Target: ${database.hostname}:${database.port || "5432"}${database.pathname} → ${origin.origin}`,
    );
    if (
      (
        await prompt.question(
          "Set up this empty self-hosted backend with external cleanup scheduling? Type SETUP: ",
        )
      ).trim() !== "SETUP"
    )
      throw new Error("Setup cancelled.");
  } finally {
    prompt.close();
  }
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(686271842)");
    await client.query(setupGuardSql(versions));
    const {
      rows: [ready],
    } = await client.query(
      "SELECT to_regclass('auth.users') IS NOT NULL AND to_regclass('storage.buckets') IS NOT NULL AS ready",
    );
    if (!ready.ready)
      throw new Error(
        "Finish configuring Supabase Auth and Storage before database setup.",
      );
    const {
      rows: [installed],
    } = await client.query(
      "SELECT to_regclass('public.fb_config') IS NOT NULL AS installed",
    );
    if (!installed.installed) {
      await client.query(
        "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions",
      );
      await client.query(
        "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY, statements text[], name text)",
      );
      for (const filename of files) {
        await client.query(
          selfHostedMigration(
            readFileSync(
              resolve(root, "supabase/migrations", filename),
              "utf8",
            ),
            filename,
          ),
        );
        await client.query(
          "INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES($1,$2)",
          [filename.split("_")[0], filename.replace(/^\d+_|\.sql$/g, "")],
        );
      }
    }
    await client.query(
      "UPDATE public.fb_cleanup_config SET endpoint=$1 WHERE id=true",
      [`${origin.origin}/api/internal/purge-deleted`],
    );
    await client.query("SELECT pg_notify('pgrst', 'reload schema')");
    await client.query("COMMIT");
    console.log(
      "Self-hosted database setup complete. Configure an hourly POST to /api/internal/purge-deleted using this backend's worker secret. Verify a successful run before using deletion recovery.",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
main().catch(() => {
  // Database/provider diagnostics can contain connection credentials or SQL values.
  console.error(
    "Self-hosted setup stopped. Review the target, service readiness and migration compatibility before retrying.",
  );
  process.exitCode = 1;
});
