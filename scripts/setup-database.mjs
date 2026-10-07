import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = process.platform === "win32" ? "npx.cmd" : "npx";
const cliVersion = "supabase@2.119.0";

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith("--")) {
    throw new Error(`${name} needs a value.`);
  }
  return process.argv[index + 1];
}

function validateProjectRef(value) {
  if (!/^[a-z]{20}$/.test(value)) {
    throw new Error(
      "Enter the 20-letter Supabase project reference, not its URL.",
    );
  }
  return value;
}

function validateOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    ![value, value.replace(/\/$/, "")].includes(url.origin)
  ) {
    throw new Error(
      "Enter the direct HTTPS address of the deployed Fieldbook, with no path.",
    );
  }
  return url.origin;
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Resume only a fully migrated, unused installation whose final connection is missing. */
export function setupGuardSql(versions) {
  if (!versions.length || versions.some((version) => !/^\d+$/.test(version))) {
    throw new Error("Fieldbook migration versions are missing or invalid.");
  }
  const expected = versions.toSorted().map(sqlString).join(",");
  return `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind IN ('r', 'p', 'v', 'm') AND relname <> 'spatial_ref_sys'
    ) THEN RETURN; END IF;
    IF to_regclass('public.fb_config') IS NULL
      OR to_regclass('public.fb_profiles') IS NULL
      OR to_regclass('public.fb_documents') IS NULL
      OR to_regclass('public.fb_media') IS NULL
      OR to_regclass('public.fb_cleanup_config') IS NULL
      OR to_regclass('supabase_migrations.schema_migrations') IS NULL
    THEN RAISE EXCEPTION 'This project is not an empty or unfinished Fieldbook installation'; END IF;
    IF EXISTS (
      SELECT 1 FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind IN ('r', 'p', 'v', 'm') AND relname <> 'spatial_ref_sys'
        AND left(relname, 3) <> 'fb_'
    ) THEN RAISE EXCEPTION 'This project contains another application'; END IF;
    IF (SELECT array_agg(version::text ORDER BY version::text)
        FROM supabase_migrations.schema_migrations)
      IS DISTINCT FROM ARRAY[${expected}]::text[]
    THEN RAISE EXCEPTION 'Migration history differs from this source; review the earlier setup error or use the upgrade guide'; END IF;
    IF EXISTS (SELECT 1 FROM public.fb_profiles)
      OR EXISTS (SELECT 1 FROM public.fb_documents)
      OR EXISTS (SELECT 1 FROM public.fb_media)
      OR (SELECT count(*) FROM public.fb_config) <> 1
      OR (SELECT count(*) FROM public.fb_cleanup_config) <> 1
      OR EXISTS (SELECT 1 FROM public.fb_cleanup_config WHERE endpoint IS NOT NULL)
    THEN RAISE EXCEPTION 'Fieldbook is already configured or contains records; use the upgrade guide'; END IF;
    RAISE NOTICE 'Finishing the interrupted Fieldbook installation';
  END $$;`;
}

async function run(...args) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      cli,
      [
        "--yes",
        cliVersion,
        "--agent",
        "no",
        "--output-format",
        "text",
        ...args,
      ],
      { cwd: root, env: process.env, stdio: "inherit" },
    );
    child.on("error", rejectRun);
    child.on("exit", (code) =>
      code === 0
        ? resolveRun()
        : rejectRun(
            new Error(`Supabase setup stopped (${args[0]} exited ${code}).`),
          ),
    );
  });
}

async function checkWorker(origin) {
  const response = await fetch(`${origin}/api/internal/purge-deleted`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null);
  if (response.status !== 401 || body?.error !== "Invalid worker credential.") {
    throw new Error(
      "The deployed Fieldbook worker is not reachable at this direct address.",
    );
  }
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "node scripts/setup-database.mjs [--project-ref <ref>] [--url <https://host>]",
    );
    console.log(
      "For a new, empty Supabase project after Fieldbook is deployed.",
    );
    return;
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let projectRef;
  let origin;
  try {
    projectRef = validateProjectRef(
      option("--project-ref") ||
        process.env.SUPABASE_PROJECT_REF ||
        (await prompt.question("Supabase project reference: ")).trim(),
    );
    origin = validateOrigin(
      option("--url") ||
        process.env.FIELDBOOK_URL ||
        (await prompt.question("Deployed Fieldbook HTTPS address: ")).trim(),
    );
    console.log(`\nTarget: Supabase ${projectRef} → ${origin}`);
    const answer = (
      await prompt.question("Set up this new project? Type SETUP: ")
    ).trim();
    if (answer !== "SETUP") throw new Error("Setup cancelled.");
  } finally {
    prompt.close();
  }

  console.log("Checking the deployed worker...");
  await checkWorker(origin);
  console.log("Connecting to Supabase...");
  if (!process.env.SUPABASE_ACCESS_TOKEN) await run("login", "--no-browser");
  await run("link", "--project-ref", projectRef);
  const versions = readdirSync(resolve(root, "supabase/migrations"))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .map((name) => name.split("_")[0]);
  await run("db", "query", "--linked", setupGuardSql(versions));
  console.log("Installing Fieldbook's database...");
  await run("db", "push", "--linked", "--yes");

  const endpoint = sqlString(`${origin}/api/internal/purge-deleted`);
  await run(
    "db",
    "query",
    "--linked",
    `DO $$ BEGIN
      UPDATE public.fb_cleanup_config SET endpoint = ${endpoint} WHERE id = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Cleanup configuration is missing'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.fb_config WHERE id = true) THEN
        RAISE EXCEPTION 'Fieldbook settings are missing';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM storage.buckets WHERE id = 'fieldbook-media' AND public = false
      ) THEN RAISE EXCEPTION 'Private media bucket is missing'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM cron.job
        WHERE jobname = 'fieldbook-purge-deleted'
          AND schedule = '17 * * * *' AND active
      ) THEN RAISE EXCEPTION 'Scheduled cleanup is missing or inactive'; END IF;
    END $$;`,
  );
  console.log(
    "Database setup complete. Sign in as the owner after Google sign-in is configured.",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`Database setup: ${error.message}`);
    process.exitCode = 1;
  });
}
