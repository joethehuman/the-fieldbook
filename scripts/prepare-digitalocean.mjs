import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import pg from "pg";
import { selfHostedConnectionOptions } from "./providers/supabase/self-hosted.mjs";

const preparation = readFileSync(
  new URL("../.do/prepare-supabase-backend.sql", import.meta.url),
  "utf8",
);
const credentials = {
  supabase_auth_admin: "AUTH_DATABASE_PASSWORD",
  authenticator: "REST_DATABASE_PASSWORD",
  supabase_storage_admin: "STORAGE_DATABASE_PASSWORD",
};

export async function prepareDigitalOcean(client, env) {
  const passwords = Object.entries(credentials).map(([role, key]) => {
    const password = env[key];
    if (!/^[a-f0-9]{64}$/.test(password || ""))
      throw new Error("Use the generated independent backend passwords.");
    return [role, password];
  });
  if (new Set(passwords.map(([, password]) => password)).size !== 3)
    throw new Error("Backend services require independent passwords.");
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(686271842)");
    await client.query(preparation);
    for (const [role, password] of passwords) {
      // pg parameters cannot appear in ALTER ROLE. PostgreSQL quotes both values.
      const {
        rows: [row],
      } = await client.query(
        "SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS command",
        [role, password],
      );
      await client.query(row.command);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const ca = readFileSync(
    process.env.FIELDBOOK_SETUP_DATABASE_CA || "",
    "utf8",
  );
  const url = process.env.FIELDBOOK_SETUP_DATABASE_URL || "";
  const options = selfHostedConnectionOptions(url, ca);
  const target = new URL(url);
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    console.log(
      `Target: ${target.hostname}:${target.port || "5432"}${target.pathname}`,
    );
    if (
      (
        await prompt.question(
          "Prepare this empty dedicated PostgreSQL 17 backend? Type PREPARE: ",
        )
      ).trim() !== "PREPARE"
    )
      return;
  } finally {
    prompt.close();
  }
  const client = new pg.Client(options);
  await client.connect();
  try {
    await prepareDigitalOcean(client, process.env);
    console.log(
      "Backend roles and schemas prepared. Start Auth and Storage to run their own migrations, then run setup-self-hosted.mjs.",
    );
  } finally {
    await client.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(() => {
    // Driver errors may contain credentials or submitted SQL.
    console.error(
      "Backend preparation stopped. Check the target, verified CA, empty dedicated database, PostgreSQL 17 and administrator privileges. No diagnostic credentials are printed.",
    );
    process.exitCode = 1;
  });
}
