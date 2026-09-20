import "server-only";
export function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  // Use Vercel's trusted branch hostname, never a client-supplied Host header.
  const previewHost = process.env.VERCEL_ENV === "preview"
    ? process.env.VERCEL_BRANCH_URL
    : undefined;
  const origin = previewHost
    ? `https://${previewHost}`
    : process.env.FIELDBOOK_URL;
  const owner = process.env.FIELDBOOK_OWNER_EMAIL?.trim().toLowerCase();
  if (!url || !key || !secret || !origin || !owner)
    throw new Error(
      "Fieldbook production configuration is incomplete. Set the required environment variables.",
    );
  if (
    process.env.VERCEL_ENV === "preview" ||
    process.env.FIELDBOOK_ENVIRONMENT === "preview"
  ) {
    const previewRef = process.env.FIELDBOOK_PREVIEW_SUPABASE_REF;
    if (!previewRef || new URL(url).hostname !== `${previewRef}.supabase.co`)
      throw new Error(
        "Preview must use its explicitly configured isolated Supabase backend.",
      );
  }
  return { url, key, secret, origin: new URL(origin).origin, owner };
}
