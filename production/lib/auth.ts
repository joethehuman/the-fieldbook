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
  const owner = u.email.toLowerCase() === env().owner;
  const { data: config, error: configError } = await db()
    .from("fb_config")
    .select("settings")
    .single();
  check(configError);
  if (!owner && config?.settings.registration !== "open")
    throw new HttpError(403, "New account registration is closed.");
  const row = {
    id: u.id,
    name: String(u.user_metadata?.full_name || u.email.split("@")[0]).slice(
      0,
      80,
    ),
    email: u.email,
    role: owner ? "admin" : "learner",
    active: true,
    groups: [],
    group_joined_at: {},
  };
  const { error: insertError } = await db()
    .from("fb_profiles")
    .upsert(row, { onConflict: "id", ignoreDuplicates: true });
  check(insertError);
  const { data: saved, error: savedError } = await db()
    .from("fb_profiles")
    .select("*")
    .eq("id", u.id)
    .single();
  check(savedError);
  return profile(saved);
}
export function requireAdmin(user: User | null): asserts user is User {
  if (!user) throw new HttpError(401, "Sign in to continue.");
  if (user.role !== "admin")
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
