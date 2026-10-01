import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "../../env";
import { isAbsentSession } from "../../errors";

/** Refresh only; Fieldbook's actor services separately verify identity and permissions. */
export async function refreshIdentitySession(
  request: NextRequest,
  requestHeaders: Headers,
): Promise<NextResponse> {
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-")))
    return response;
  const { url, key } = env();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value } of values) request.cookies.set(name, value);
        requestHeaders.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers: requestHeaders } });
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
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
  return response;
}
