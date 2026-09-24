import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { db, check } from "./db";
import { env } from "./env";
import type { User } from "@/lib/types";

import { HttpError, ServiceError, isAbsentSession } from "./errors";
export { HttpError, errorResponse } from "./errors";
export async function authClient(readOnly = false) {
  const jar = await cookies();
  const { url, key } = env();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        if (readOnly) return; // Reading pages refresh cookies in proxy before rendering.
        for (const { name, value, options } of values)
          jar.set(name, value, options);
      },
    },
  });
}
export function profile(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    groups: row.groups,
    teamId: row.team_id || undefined,
    onboardingStart: row.onboarding_start || undefined,
    groupJoinedAt: row.group_joined_at,
    effectiveGroupJoinedAt: row.effective_group_joined_at,
  };
}
export async function actor(
  token?: string,
  readOnly = false,
): Promise<User | null> {
  const client = token ? db() : await authClient(readOnly);
  let result;
  try {
    result = await client.auth.getUser(token);
  } catch {
    throw new ServiceError(
      "Sign-in verification is unavailable. Try again shortly; contact an administrator if it continues.",
      "auth",
    );
  }
  const { data, error } = result;
  if (error) {
    if (isAbsentSession(error)) return null;
    throw new ServiceError(
      "Sign-in verification is unavailable. Try again shortly; contact an administrator if it continues.",
      "auth",
      error.code,
    );
  }
  if (!data.user) return null;
  const u = data.user;
  if (!u.email || !u.email_confirmed_at)
    throw new HttpError(403, "A verified account is required.");
  const { data: found, error: lookupError } = await db()
    .from("fb_profiles")
    .select("*")
    .eq("id", u.id)
    .maybeSingle();
  check(lookupError);
  if (found) {
    if (!found.active) throw new HttpError(403, "This account is inactive.");
    return profile(found);
  }
  if (token)
    throw new HttpError(
      403,
      "Sign in to Fieldbook before connecting an AI client.",
    );
  const { data: saved, error: registrationError } = await db().rpc(
    "fb_register_profile",
    {
      p_id: u.id,
      p_email: u.email,
      p_name: String(u.user_metadata?.full_name || u.email.split("@")[0]).slice(
        0,
        80,
      ),
      p_owner: u.email.toLowerCase() === env().owner,
    },
  );
  if (registrationError && registrationError.code !== "P0001")
    check(registrationError);
  if (registrationError)
    throw new HttpError(
      403,
      "This account cannot register. Contact an administrator.",
    );
  if (!saved.active) throw new HttpError(403, "This account is inactive.");
  return profile(saved);
}
/** Reader identity uses a verified JWT and keeps the profile check fresh. */
export async function readerActor(): Promise<User | null> {
  const client = await authClient(true);
  let result;
  try {
    result = await client.auth.getClaims();
  } catch {
    throw new ServiceError(
      "Sign-in verification is unavailable. Try again shortly; contact an administrator if it continues.",
      "auth",
    );
  }
  if (result.error) {
    if (isAbsentSession(result.error)) return null;
    // Older signing keys and unusual providers can still be verified by Auth.
    return actor(undefined, true);
  }
  const id = result.data?.claims.sub;
  if (!id) return null;
  const { data: found, error } = await db()
    .from("fb_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  check(error);
  if (!found) return actor(undefined, true); // First visit registers a verified account.
  if (!found.active) throw new HttpError(403, "This account is inactive.");
  return profile(found);
}
export function requireAdmin(user: User | null): asserts user is User {
  if (!user) throw new HttpError(401, "Sign in to continue.");
  if (!user.active || user.role !== "admin")
    throw new HttpError(403, "Administrator access is required.");
}
export function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== env().origin)
    throw new HttpError(
      403,
      "This request must come from your Fieldbook site.",
    );
}
