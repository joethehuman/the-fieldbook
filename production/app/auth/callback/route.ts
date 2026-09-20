import { authClient, actor } from "@production/lib/auth";
import { env } from "@production/lib/env";
import { safeNext } from "@production/lib/redirect";
export async function GET(req: Request) {
  const url = new URL(req.url),
    code = url.searchParams.get("code"),
    client = await authClient();
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      try {
        await actor();
        return Response.redirect(
          new URL(safeNext(url.searchParams.get("next")), env().origin),
        );
      } catch {
        await client.auth.signOut();
      }
    }
  }
  return Response.redirect(`${env().origin}/sign-in?error=unavailable`);
}
