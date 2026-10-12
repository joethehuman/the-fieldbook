/** The application schema remains the released baseline. A self-hosted backend
 * may delegate HTTP cleanup scheduling to its hosting platform instead of pg_net. */
export function selfHostedMigration(source, filename) {
  // The installer owns the transaction across the complete migration set.
  source = source.replace(/^begin;\s*$/gim, "").replace(/^commit;\s*$/gim, "");
  if (filename !== "20261006061752_initial_install.sql") {
    if (/\b(?:net\.http_post|cron\.schedule)\b/.test(source))
      throw new Error(
        "This migration needs a reviewed self-hosted scheduling implementation.",
      );
    return source;
  }
  const schedule =
    /-- The installer connects this schedule to the deployed worker endpoint\.\nselect cron\.schedule\('fieldbook-purge-deleted',[\s\S]*?\$cleanup\$\);/;
  if (!schedule.test(source))
    throw new Error(
      "The released baseline scheduling section was not recognized.",
    );
  return source
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
