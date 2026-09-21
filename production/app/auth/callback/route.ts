import { cookies } from "next/headers";
import { authClient, actor, HttpError } from "@production/lib/auth";
import { env } from "@production/lib/env";
import { safeNext } from "@production/lib/redirect";
import { SIGN_IN_RETURN_COOKIE } from "@production/lib/sign-in";
import { signInFailure } from "@production/lib/sign-in-failure";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const next = safeNext(
    url.searchParams.get("next") ?? jar.get(SIGN_IN_RETURN_COOKIE)?.value,
  );
  let origin = url.origin;
  try {
    origin = env().origin;
    const client = await authClient();
    const code = url.searchParams.get("code");
    if (!code) return signInFailure(origin, next);
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      if (
        [
          "flow_state_not_found",
          "flow_state_expired",
          "bad_code_verifier",
        ].includes(error.code || "")
      )
        return signInFailure(origin, next);
      throw error;
    }
    try {
      const user = await actor();
      if (!user) return signInFailure(origin, next);
    } catch (e) {
      if (e instanceof HttpError && e.status === 403)
        await client.auth.signOut();
      throw e;
    }
    jar.delete(SIGN_IN_RETURN_COOKIE);
    return Response.redirect(new URL(next, origin));
  } catch (e) {
    return signInFailure(origin, next, e);
  }
}
