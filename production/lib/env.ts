import "server-only";
export function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const origin = process.env.FIELDBOOK_URL;
  const owner = process.env.FIELDBOOK_OWNER_EMAIL?.trim().toLowerCase();
  if (!url || !key || !secret || !origin || !owner)
    throw new Error(
      "Fieldbook production configuration is incomplete. Set the required environment variables.",
    );
  return { url, key, secret, origin: new URL(origin).origin, owner };
}
