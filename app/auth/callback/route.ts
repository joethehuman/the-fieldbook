import { cookies } from "next/headers";
import { actor, HttpError } from "@server/auth";
import { exchangeSignInCode, signOutIdentity } from "@server/identity";
import { installation } from "@server/installation";
import { safeNext } from "@server/redirect";
import { SIGN_IN_RETURN_COOKIE } from "@server/sign-in";
import { signInFailure } from "@server/sign-in-failure";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const next = safeNext(
    url.searchParams.get("next") ?? jar.get(SIGN_IN_RETURN_COOKIE)?.value,
    "/",
  );
  let origin = url.origin;
  try {
    origin = installation().origin;
    const code = url.searchParams.get("code");
    if (!code) return signInFailure(origin, next);
    if (!(await exchangeSignInCode(code))) return signInFailure(origin, next);
    try {
      const user = await actor();
      if (!user) return signInFailure(origin, next);
    } catch (e) {
      if (e instanceof HttpError && e.status === 403) await signOutIdentity();
      throw e;
    }
    jar.delete(SIGN_IN_RETURN_COOKIE);
    return Response.redirect(new URL(next, origin));
  } catch (e) {
    return signInFailure(origin, next, e);
  }
}
