import { readFileSync } from "node:fs";

// The fresh-install baseline retains section markers for focused database tests.
const baseline = readFileSync(
  new URL(
    "../../supabase/migrations/20261006061752_initial_install.sql",
    import.meta.url,
  ),
  "utf8",
);

export function migrationSql(name) {
  if (!/^[0-9]+_[a-z0-9_]+\.sql$/.test(name))
    throw new Error(`Invalid baseline section: ${name}`);
  const begin = `-- Begin ${name}\n`;
  const end = `-- End ${name}`;
  const start = baseline.indexOf(begin);
  if (start < 0) throw new Error(`Baseline section not found: ${name}`);
  const stop = baseline.indexOf(end, start + begin.length);
  if (stop < 0) throw new Error(`Baseline section is incomplete: ${name}`);
  return baseline.slice(start + begin.length, stop);
}
