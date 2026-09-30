import "server-only";
import { NextResponse } from "next/server";
import { safeNext } from "./redirect";
import { SIGN_IN_RETURN_COOKIE } from "./sign-in";
import { errorResponse, HttpError } from "./errors";
export function signInFailure(origin: string, next: string, error?: unknown) {
  const url = new URL("/sign-in", origin);
  url.searchParams.set(
    "error",
    error instanceof HttpError && error.status === 403
      ? "access"
      : error
        ? "service"
        : "cancelled",
  );
  if (error)
    url.searchParams.set(
      "reference",
      errorResponse(error, "auth/sign-in").headers.get("X-Request-Id")!,
    );
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set(SIGN_IN_RETURN_COOKIE, safeNext(next, "/"), {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
