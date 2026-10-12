import { cookies } from "next/headers";
import { SIGN_IN_RETURN_COOKIE } from "@server/sign-in";
import { signInFailure } from "@server/sign-in-failure";
import { startSignIn } from "@server/identity";
import { installation } from "@server/installation";
import { safeNext } from "@server/redirect";
import { requestMatchesOrigin } from "@server/deployment";
import { errorResponse } from "@server/errors";
export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const cookieStore = await cookies();
  const next = safeNext(
    requestUrl.searchParams.get("next") ??
      cookieStore.get(SIGN_IN_RETURN_COOKIE)?.value,
    "/",
  );
  let origin: string | undefined;
  try {
    origin = installation().origin;
    // PKCE cookies must be set on the same host that receives the callback.
    if (!requestMatchesOrigin(req, origin)) {
      return Response.redirect(
        `${origin}/auth/login?next=${encodeURIComponent(next)}`,
      );
    }
    const destination = await startSignIn(
      `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    );
    return Response.redirect(destination);
  } catch (e) {
    return origin
      ? signInFailure(origin, next, e)
      : errorResponse(e, "auth/login");
  }
}
