import type { NextRequest } from "next/server";
import { refreshIdentitySession } from "./server/identity";

// Refresh cookie sessions before a reading Server Component needs them.
// The session data is untrusted; actor() verifies the user on every read.
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-fieldbook-reader-path", request.nextUrl.pathname);
  requestHeaders.set(
    "x-fieldbook-reader-return",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  const response = await refreshIdentitySession(request, requestHeaders);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/admin/:path*",
    "/docs",
    "/docs/:id+",
    "/updates",
    "/updates/:id+",
    "/courses",
    "/courses/:id+",
    "/team/:path*",
    "/curricula",
    "/curricula/:id+",
  ],
};
