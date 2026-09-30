import "server-only";
import { ServiceError } from "./errors";
export function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  // Use Vercel's trusted branch hostname, never a client-supplied Host header.
  const previewHost =
    process.env.VERCEL_ENV === "preview"
      ? process.env.VERCEL_BRANCH_URL
      : undefined;
  const origin = previewHost
    ? `https://${previewHost}`
    : process.env.FIELDBOOK_URL;
  const owner = process.env.FIELDBOOK_OWNER_EMAIL?.trim().toLowerCase();
  if (!url || !key || !secret || !origin || !owner)
    throw new ServiceError(
      "Fieldbook configuration is incomplete. Ask the operator to check the required environment variables.",
      "configuration",
      "configuration_missing",
    );
  if (
    process.env.VERCEL_ENV === "preview" ||
    process.env.FIELDBOOK_ENVIRONMENT === "preview"
  ) {
    const previewRef = process.env.FIELDBOOK_PREVIEW_SUPABASE_REF;
    if (!previewRef || new URL(url).hostname !== `${previewRef}.supabase.co`)
      throw new ServiceError(
        "Preview must use its explicitly configured isolated Supabase backend.",
        "configuration",
        "preview_backend",
      );
  }
  return { url, key, secret, origin: new URL(origin).origin, owner };
}

export function siteOrigins() {
  const canonical = env().origin;
  const deploymentHost =
    process.env.VERCEL_ENV === "preview" ? process.env.VERCEL_URL : undefined;
  return deploymentHost
    ? [canonical, new URL(`https://${deploymentHost}`).origin]
    : [canonical];
}
