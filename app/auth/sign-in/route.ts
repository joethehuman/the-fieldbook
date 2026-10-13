import { NextResponse } from "next/server";
import { safeNext } from "../../../server/redirect";
import { SIGN_IN_RETURN_COOKIE } from "../../../server/sign-in";
import { installation } from "../../../server/installation";
import { requestMatchesOrigin } from "../../../server/deployment";

// Remember the destination before displaying a clean, shareable sign-in URL.
export function GET(req: Request) {
  const url = new URL(req.url);
  const origin = installation().origin;
  const next = safeNext(url.searchParams.get("next"), "/");
  if (!requestMatchesOrigin(req, origin)) {
    const canonical = new URL("/auth/sign-in", origin);
    canonical.searchParams.set("next", next);
    const response = NextResponse.redirect(canonical);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const response = NextResponse.redirect(new URL("/sign-in", origin));
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set(SIGN_IN_RETURN_COOKIE, next, {
    httpOnly: true,
    secure: new URL(origin).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
