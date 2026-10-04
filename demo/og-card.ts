export function demoOgOrigin() {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_BRANCH_URL)
    return `https://${process.env.VERCEL_BRANCH_URL}`;
  if (process.env.FIELDBOOK_URL) return process.env.FIELDBOOK_URL;
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : undefined;
}
