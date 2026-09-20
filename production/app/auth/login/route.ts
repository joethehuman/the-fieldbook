import { authClient, errorResponse } from "@production/lib/auth";
import { env } from "@production/lib/env";
import { safeNext } from "@production/lib/redirect";
export async function GET(req: Request) {
  try {
    const next = safeNext(new URL(req.url).searchParams.get("next"));
    const client = await authClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${env().origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error || !data.url) throw error || new Error("Login unavailable");
    return Response.redirect(data.url);
  } catch (e) {
    return errorResponse(e);
  }
}
