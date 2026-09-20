import { cookies } from "next/headers";
import { SIGN_IN_RETURN_COOKIE } from "@production/lib/sign-in";
import { authClient, errorResponse } from "@production/lib/auth";
import { env } from "@production/lib/env";
import { safeNext } from "@production/lib/redirect";
export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url);
    const cookieStore = await cookies();
    const next = safeNext(
      requestUrl.searchParams.get("next") ??
        cookieStore.get(SIGN_IN_RETURN_COOKIE)?.value,
    );
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
    cookieStore.delete(SIGN_IN_RETURN_COOKIE);
    return Response.redirect(data.url);
  } catch (e) {
    return errorResponse(e);
  }
}
