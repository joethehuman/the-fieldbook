import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "../../env";
import { HttpError, ServiceError } from "../../errors";
export function db() {
  const { url, secret } = env();
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
export function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.message.includes("Revision conflict"))
    throw new HttpError(
      409,
      "This item changed since you opened it. Review the saved copy before saving.",
    );
  throw new ServiceError(
    "The database operation failed. Try again; contact an administrator if it continues.",
    "database",
    error.code,
  );
}
