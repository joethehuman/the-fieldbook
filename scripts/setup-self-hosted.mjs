import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import pg from "pg";
import {
  selfHostedConnectionOptions,
  SelfHostedSetupError,
} from "./providers/supabase/self-hosted.mjs";
import { runSelfHostedMigrations } from "./providers/supabase/migrations.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("node scripts/setup-self-hosted.mjs [--upgrade] [--dry-run]");
    console.log(
      "Default: fresh setup only. --upgrade: apply pending migrations to existing data.",
    );
    console.log(
      "--dry-run: read-only history and compatibility checks; lists pending files without executing them.",
    );
    console.log(
      "Set FIELDBOOK_SETUP_DATABASE_URL and FIELDBOOK_SETUP_DATABASE_CA (PEM path). Fresh setup also requires FIELDBOOK_URL.",
    );
    return;
  }
  if (args.some((arg) => !["--upgrade", "--dry-run"].includes(arg))) {
    throw new SelfHostedSetupError(
      "Unknown option. Use --help for the supported commands.",
    );
  }
  const upgrade = args.includes("--upgrade");
  const dryRun = args.includes("--dry-run");
  let origin;
  if (!upgrade) {
    let url;
    try {
      url = new URL(process.env.FIELDBOOK_URL || "");
    } catch {}
    if (
      !url ||
      url.protocol !== "https:" ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      throw new SelfHostedSetupError(
        "Set FIELDBOOK_URL to the canonical HTTPS Fieldbook origin, without a path.",
      );
    }
    origin = url.origin;
  }
  const caFile = process.env.FIELDBOOK_SETUP_DATABASE_CA;
  const options = selfHostedConnectionOptions(
    process.env.FIELDBOOK_SETUP_DATABASE_URL,
    caFile ? readFileSync(caFile, "utf8") : undefined,
  );
  const database = new URL(options.connectionString);
  const client = new pg.Client(options);
  const migrations = readdirSync(resolve(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((filename) => ({
      filename,
      source: readFileSync(
        resolve(root, "supabase/migrations", filename),
        "utf8",
      ),
    }));
  console.log(
    `Target: ${database.hostname}:${database.port || "5432"}${database.pathname}${origin ? ` → ${origin}` : ""}`,
  );
  if (!dryRun) {
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      const confirmation = upgrade ? "UPGRADE" : "SETUP";
      const answer = await prompt.question(
        upgrade
          ? "Apply pending Fieldbook migrations to this installation? Type UPGRADE: "
          : "Set up this empty backend with external cleanup scheduling? Type SETUP: ",
      );
      if (answer.trim() !== confirmation)
        throw new SelfHostedSetupError("Database operation cancelled.");
    } finally {
      prompt.close();
    }
  }
  await client.connect();
  try {
    const result = await runSelfHostedMigrations(client, {
      migrations,
      upgrade,
      dryRun,
      origin,
    });
    console.log(
      `${dryRun ? "Pending" : "Applied"} migrations: ${result.pending.length ? result.pending.join(", ") : "none"}.`,
    );
    if (dryRun) {
      console.log(
        "Dry run complete; no schema or records changed. Pending SQL has not been executed or proven compatible by this preview.",
      );
    } else if (upgrade) {
      console.log(
        "Fieldbook database update complete. The cleanup endpoint and worker credential are unchanged. Check affected flows and the next external cleanup run.",
      );
    } else {
      console.log(
        "Self-hosted database setup complete. Configure an hourly POST to /api/internal/purge-deleted using this backend's worker secret. Verify a successful run before using deletion recovery.",
      );
    }
  } finally {
    await client.end();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    // Database/provider diagnostics can contain credentials or SQL values.
    console.error(
      error instanceof SelfHostedSetupError
        ? error.message
        : "Self-hosted database operation stopped. Review the target, TLS certificate, service readiness and migration compatibility before retrying. No database diagnostics were printed because they can contain credentials or records.",
    );
    process.exitCode = 1;
  });
}
