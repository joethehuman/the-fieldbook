import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
export function db() {
  const { url, secret } = env();
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function check(error: { message: string } | null) {
  if (error)
    throw new Error(
      error.message.includes("Revision conflict")
        ? "This item changed since you opened it. Reload before saving."
        : "The database operation failed. Please try again.",
    );
}
