import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { db, check } from "./db";
import { env } from "./env";
import type { User } from "@/lib/types";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function authClient() {
  const jar = await cookies();
  const { url, key } = env();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
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
    groupJoinedAt: row.group_joined_at,
    effectiveGroupJoinedAt: row.effective_group_joined_at,
  };
}
export async function actor(token?: string): Promise<User | null> {
  const client = token ? db() : await authClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
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
  if (registrationError)
    throw new HttpError(
      403,
      "This account cannot register. Contact an administrator.",
    );
  if (!saved.active) throw new HttpError(403, "This account is inactive.");
  return profile(saved);
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
export function errorResponse(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof HttpError
          ? e.message
          : e instanceof Error && e.message.startsWith("This item changed")
            ? e.message
            : "Unable to complete this request. Please try again.",
    },
    {
      status: e instanceof HttpError ? e.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
