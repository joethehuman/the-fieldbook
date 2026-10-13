const origin = new URL(process.env.FIELDBOOK_URL || "");
const secret = process.env.FIELDBOOK_CLEANUP_SECRET || "";
if (origin.protocol !== "https:" || !/^[a-f0-9]{64}$/.test(secret))
  throw new Error(
    "Configure the canonical HTTPS FIELDBOOK_URL and backend cleanup credential.",
  );
const response = await fetch(new URL("/api/internal/purge-deleted", origin), {
  method: "POST",
  redirect: "error",
  headers: { Authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(60_000),
});
if (!response.ok)
  throw new Error(`Cleanup request failed (${response.status}).`);
const result = await response.json();
if (result.failed !== 0)
  throw new Error(
    "Cleanup reported a failure. Review the installation before the next scheduled run.",
  );
console.log(`Cleanup completed: ${Number(result.removed) || 0} removed.`);
