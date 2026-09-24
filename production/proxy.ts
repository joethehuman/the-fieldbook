import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "./lib/env";
import { isAbsentSession } from "./lib/errors";

// Refresh cookie sessions before a reading Server Component needs them.
// The session data is untrusted; actor() verifies the user on every read.
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-fieldbook-reader-path", request.nextUrl.pathname);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  if (
    request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"))
  ) {
    const { url, key } = env();
    const client = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          for (const { name, value } of values)
            request.cookies.set(name, value);
          requestHeaders.set("cookie", request.cookies.toString());
          response = NextResponse.next({
            request: { headers: requestHeaders },
          });
          for (const { name, value, options } of values)
            response.cookies.set(name, value, options);
        },
      },
    });
    try {
      const { error } = await client.auth.getSession();
      if (error && !isAbsentSession(error)) throw error;
    } catch {
      return new NextResponse(
        "Sign-in verification is unavailable. Please try again.",
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/docs",
    "/docs/:id+",
    "/knowledge/:id+",
    "/updates",
    "/updates/:id+",
    "/briefs/:id+",
    "/notes/:id+",
    "/courses/:id+",
    "/learn/:id+",
    "/learning/:id+",
  ],
};
