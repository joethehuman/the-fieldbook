import { createHash } from "node:crypto";

export const baselineFilename = "20261006061752_initial_install.sql";
export const baselineSha256 =
  "bde4df917469ebdb2bb085887ba8778aa399849e1ed27ba6cb5e016c1bfd10bb";

/** Messages from this class contain operator guidance, never database diagnostics. */
export class SelfHostedSetupError extends Error {}

// Only top-level transaction wrappers belong to the runner. Ignore quoted SQL
// function bodies and comments when locating statements; preserve source bytes.
function statements(source) {
  const result = [];
  let start = 0;
  let text = "";
  for (let index = 0; index < source.length;) {
    if (source.startsWith("--", index)) {
      index = source.indexOf("\n", index);
      if (index === -1) break;
      text += " ";
    } else if (source.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (depth && index < source.length) {
        if (source.startsWith("/*", index)) {
          depth++;
          index += 2;
        } else if (source.startsWith("*/", index)) {
          depth--;
          index += 2;
        } else index++;
      }
      if (depth)
        throw new SelfHostedSetupError(
          "A migration has an unterminated SQL comment.",
        );
      text += " ";
    } else if (source[index] === "'" || source[index] === '"') {
      const quote = source[index];
      const escaped =
        quote === "'" && /(?:^|\W)e$/i.test(source.slice(0, index));
      index++;
      let closed = false;
      while (index < source.length) {
        if (escaped && source[index] === "\\") index += 2;
        else if (source[index] === quote && source[index + 1] === quote)
          index += 2;
        else if (source[index++] === quote) {
          closed = true;
          break;
        }
      }
      if (!closed)
        throw new SelfHostedSetupError(
          "A migration has an unterminated SQL quote.",
        );
      text += " quoted ";
    } else {
      const dollar = source.slice(index).match(/^\$(?:[a-z_][\w]*)?\$/i)?.[0];
      if (dollar) {
        const end = source.indexOf(dollar, index + dollar.length);
        if (end === -1)
          throw new SelfHostedSetupError(
            "A migration has an unterminated SQL function body.",
          );
        index = end + dollar.length;
        text += " quoted ";
      } else if (source[index] === ";") {
        if (text.trim())
          result.push({ text: text.trim(), start, end: index + 1 });
        start = ++index;
        text = "";
      } else text += source[index++];
    }
  }
  if (text.trim())
    result.push({ text: text.trim(), start, end: source.length });
  return result;
}

function withoutTransactionWrapper(source) {
  const parts = statements(source);
  const first = parts[0];
  const last = parts.at(-1);
  const wrapped =
    /^begin(?:\s+(?:work|transaction))?$/i.test(first?.text || "") &&
    /^commit(?:\s+(?:work|transaction))?$/i.test(last?.text || "");
  const body = wrapped ? parts.slice(1, -1) : parts;
  if (
    body.some(({ text }) =>
      /^(?:begin|commit|end|abort|rollback|savepoint|release|start\s+transaction|prepare\s+transaction|set\s+(?:local\s+)?standard_conforming_strings)\b/i.test(
        text,
      ),
    )
  ) {
    throw new SelfHostedSetupError(
      "Migration transaction commands need a reviewed self-hosted implementation.",
    );
  }
  return wrapped ? source.slice(first.end, last.start) : source;
}

/** Keep the released application SQL intact; adapt only its known HTTP schedule.
 * New extensions or database scheduling require an explicit compatibility review. */
export function selfHostedMigration(source, filename) {
  if (filename !== baselineFilename) {
    if (
      /\b(?:pg_net|pg_cron)\b|\b(?:net|cron)"?\s*\./i.test(source) ||
      statements(source).some(({ text }) =>
        /^(?:create|alter|drop)\s+extension\b/i.test(text),
      )
    ) {
      throw new SelfHostedSetupError(
        "This migration needs a reviewed self-hosted extension or scheduling implementation.",
      );
    }
    return withoutTransactionWrapper(source);
  }
  if (createHash("sha256").update(source).digest("hex") !== baselineSha256) {
    throw new SelfHostedSetupError(
      "The released baseline bytes were not recognized. Restore the unmodified migration from the release.",
    );
  }
  const schedule =
    /-- The installer connects this schedule to the deployed worker endpoint\.\nselect cron\.schedule\('fieldbook-purge-deleted',[\s\S]*?\$cleanup\$\);/;
  return source
    .replace(/^begin;\n/m, "")
    .replace(/^commit;\n?$/m, "")
    .replace(/^create extension if not exists pg_cron;\n/m, "")
    .replace(
      /^create extension if not exists pg_net with schema extensions;\n/m,
      "",
    )
    .replace(
      schedule,
      "-- HTTP cleanup scheduling is configured on the hosting platform.",
    );
}

/** pg connection-string SSL parameters override Client.ssl; discard all of them. */
export function selfHostedConnectionOptions(connectionString, ca) {
  let database;
  try {
    database = new URL(connectionString);
  } catch {
    throw new SelfHostedSetupError(
      "Set FIELDBOOK_SETUP_DATABASE_URL to the intended PostgreSQL database.",
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !database.hostname
  ) {
    throw new SelfHostedSetupError(
      "Use a PostgreSQL connection URL for the self-hosted backend.",
    );
  }
  for (const key of [...database.searchParams.keys()]) {
    if (/^(?:ssl|uselibpqcompat)/i.test(key)) database.searchParams.delete(key);
  }
  return {
    connectionString: database.toString(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    connectionTimeoutMillis: 15_000,
  };
}

/** An existing installation must have an exact ordered prefix of this release. */
export function pendingSelfHostedMigrations(migrations, applied, upgrade) {
  const versions = migrations.map(
    ({ filename }) => filename.match(/^(\d{14})_.+\.sql$/)?.[1],
  );
  if (
    !versions.length ||
    versions.some((version) => !version) ||
    new Set(versions).size !== versions.length ||
    versions.some(
      (version, index) => index > 0 && version <= versions[index - 1],
    ) ||
    migrations[0].filename !== baselineFilename
  ) {
    throw new SelfHostedSetupError(
      "Fieldbook migration files are missing, duplicated, or not in release order.",
    );
  }
  if (upgrade && !applied.length) {
    throw new SelfHostedSetupError(
      "An existing Fieldbook migration ledger is required for --upgrade. Use fresh setup only for an empty backend.",
    );
  }
  if (applied.some((version, index) => version !== versions[index])) {
    throw new SelfHostedSetupError(
      "Migration history is not a prefix of this release (unknown or missing version). Review the ledger; do not reset or repair it automatically.",
    );
  }
  return migrations.slice(applied.length);
}
