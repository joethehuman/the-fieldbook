import "server-only";
import { randomUUID } from "node:crypto";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class ServiceError extends HttpError {
  constructor(
    message: string,
    public service: "database" | "auth" | "configuration",
    public code = "unavailable",
  ) {
    super(503, message);
  }
}
// Deliberately omit exception messages, stacks, request URLs, bodies and identities.
// Only code-owned operation names and allowlisted provider codes enter the log.
const codes = new Set([
  "unavailable",
  "incomplete_read",
  "configuration_missing",
  "preview_backend",
  "42703",
  "42P01",
  "42501",
  "23505",
  "23503",
  "P0001",
  "PGRST301",
  "PGRST002",
  "request_timeout",
  "over_request_rate_limit",
  "unexpected_failure",
]);
export function errorResponse(error: unknown, operation = "request") {
  const requestId = randomUUID();
  const status = error instanceof HttpError ? error.status : 500;
  console.error(
    JSON.stringify({
      event: "fieldbook_request_failed",
      requestId,
      operation,
      status,
      service: error instanceof ServiceError ? error.service : "application",
      code:
        error instanceof ServiceError && codes.has(error.code)
          ? error.code
          : "unavailable",
    }),
  );
  return Response.json(
    {
      error:
        error instanceof HttpError
          ? error.message
          : "This action couldn’t be completed. Try again.",
      requestId,
    },
    {
      status,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    },
  );
}

export function isAbsentSession(error: { name?: string; code?: string }) {
  return (
    error.name === "AuthSessionMissingError" ||
    [
      "session_not_found",
      "session_expired",
      "refresh_token_not_found",
      "refresh_token_already_used",
      "bad_jwt",
    ].includes(error.code || "")
  );
}
