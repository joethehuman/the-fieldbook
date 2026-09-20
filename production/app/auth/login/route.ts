import { authClient, errorResponse } from "@production/lib/auth";
import { env } from "@production/lib/env";
import { safeNext } from "@production/lib/redirect";
export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url);
    const next = safeNext(requestUrl.searchParams.get("next"));
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
    return errorResponse(e);
  }
}
