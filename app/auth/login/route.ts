import { connection } from "next/server";
import { cookies } from "next/headers";
import { SIGN_IN_RETURN_COOKIE } from "@server/sign-in";
import { signInFailure } from "@server/sign-in-failure";
import { authClient } from "@server/auth";
import { env } from "@server/env";
import { safeNext } from "@server/redirect";
export async function GET(req: Request) {
  await connection();
  const requestUrl = new URL(req.url);
  const cookieStore = await cookies();
  const next = safeNext(
    requestUrl.searchParams.get("next") ??
      cookieStore.get(SIGN_IN_RETURN_COOKIE)?.value,
    "/",
  );
  try {
    const origin = env().origin;
    // PKCE cookies must be set on the same host that receives the callback.
    if (requestUrl.origin !== origin) {
      return Response.redirect(
        `${origin}/auth/login?next=${encodeURIComponent(next)}`,
      );
    }
    const client = await authClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error || !data.url) throw error || new Error("Login unavailable");
    return Response.redirect(data.url);
  } catch (e) {
    return signInFailure(requestUrl.origin, next, e);
  }
}
