import { NextResponse } from "next/server";
import { safeNext } from "../../../lib/redirect";
import { SIGN_IN_RETURN_COOKIE } from "../../../lib/sign-in";

// Remember the destination before displaying a clean, shareable sign-in URL.
export function GET(req: Request) {
  const url = new URL(req.url);
  const response = NextResponse.redirect(new URL("/sign-in", url.origin));
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set(
    SIGN_IN_RETURN_COOKIE,
    safeNext(url.searchParams.get("next")),
    {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    },
  );
  return response;
}
