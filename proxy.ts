import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { db, check } from "./server/db";
import { adminSections } from "./lib/admin-navigation";
import { env } from "./server/env";
import { unavailableResponse, admissionUnavailableResponse } from "./server/unavailable";
import { isAbsentSession } from "./server/errors";

// Refresh cookie sessions before a reading Server Component needs them.
// The session data is untrusted; actor() verifies the user on every read.
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-fieldbook-reader-path", request.nextUrl.pathname);
  requestHeaders.set(
    "x-fieldbook-reader-return",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  let verifiedUserId: string | null = null;
  let verifiedEmail = false;
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const finish = (result: NextResponse) => {
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
    result.headers.set("Cache-Control", "private, no-store");
    result.headers.set("Vary", "Cookie");
    return result;
  };
  const unavailable = () => finish(unavailableResponse());
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
      {
        const verified = await client.auth.getUser();
        if (verified.error && !isAbsentSession(verified.error))
          throw verified.error;
        verifiedUserId = verified.data.user?.id ?? null;
        verifiedEmail = !!(
          verified.data.user?.email && verified.data.user.email_confirmed_at
        );
      }
    } catch {
      return finish(admissionUnavailableResponse(request.nextUrl, "auth"));
    }
  }
  // Establish private panel admission before any prerendered HTML/RSC bytes.
  // This projected read is fresh. Renderers and APIs still verify independently;
  // no identity or permission header is trusted as an access capability.
  if (/^\/(admin|team)(\/|$)/.test(request.nextUrl.pathname)) {
    if (!verifiedUserId || !verifiedEmail) {
      const target = new URL("/auth/sign-in", request.url);
      target.searchParams.set(
        "next",
        request.nextUrl.pathname + request.nextUrl.search,
      );
      return finish(NextResponse.redirect(target));
    }
    try {
      const { data: account, error } = await db()
        .from("fb_profiles")
        .select("role,active")
        .eq("id", verifiedUserId)
        .maybeSingle();
      check(error);
      const admin = request.nextUrl.pathname.startsWith("/admin");
      const parts = request.nextUrl.pathname.split("/").filter(Boolean);
      const section = parts[1] || "content";
      const known = admin
        ? parts.length <= 2 &&
          adminSections.some((group) =>
            group.items.some((item) => item.id === section),
          )
        : parts.length === 1;
      if (
        !account?.active ||
        (admin
          ? account.role !== "admin"
          : !["admin", "manager"].includes(account.role)) ||
        !known
      )
        return unavailable();
    } catch {
      return finish(admissionUnavailableResponse(request.nextUrl, "database"));
    }
  }
  const section = request.nextUrl.pathname.split("/").filter(Boolean);
  if (!["admin", "team"].includes(section[0])) {
    try {
      const [configuration, profile] = await Promise.all([
        db()
          .from("fb_config")
          .select("access:settings->>access")
          .eq("id", true)
          .single(),
        verifiedUserId
          ? db()
              .from("fb_profiles")
              .select("active")
              .eq("id", verifiedUserId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      check(configuration.error);
      check(profile.error);
      const access = configuration.data?.access;
      if (!configuration.data || !["public", "private"].includes(access ?? ""))
        throw new Error("Missing access configuration");
      if (
        (verifiedUserId && (!profile.data?.active || !verifiedEmail)) ||
        (access === "private" && !verifiedUserId)
      ) {
        const target = new URL("/auth/sign-in", request.url);
        target.searchParams.set(
          "next",
          request.nextUrl.pathname + request.nextUrl.search,
        );
        return finish(NextResponse.redirect(target));
      }
      if (section.length > 2) return unavailable();
      if (section[1]) {
        const id = decodeURIComponent(section[1]);
        if (section[0] === "curricula") {
          const { data, error } = await db()
            .from("fb_config")
            .select("curricula")
            .eq("id", true)
            .single();
          check(error);
          if (
            !(data?.curricula || []).some(
              (item: { id: string; status?: string }) =>
                item.id === id && item.status === "published",
            )
          )
            return unavailable();
        } else {
          if (
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
              id,
            )
          )
            return unavailable();
          const { data, error } = await db()
            .from("fb_documents")
            .select("id,kind:published->>kind,status:published->>status")
            .eq("id", id)
            .not("published", "is", null)
            .is("deleted_at", null)
            .maybeSingle();
          check(error);
          const kind =
            section[0] === "docs"
              ? "doc"
              : section[0] === "updates"
                ? "brief"
                : "course";
          if (!data || data.kind !== kind || data.status !== "published")
            return unavailable();
        }
      }
    } catch {
      return finish(admissionUnavailableResponse(request.nextUrl, "database"));
    }
  }
  return finish(response);
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
    "/team",
    "/curricula",
    "/curricula/:id+",
  ],
};
