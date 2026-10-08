import test from "node:test";
import assert from "node:assert/strict";
import { check } from "../../server/db";
import {
  errorResponse,
  HttpError,
  ServiceError,
  isAbsentSession,
} from "../../server/errors";
import { actor } from "../../server/auth";

test("handled database and unknown failures log only safe metadata and matching IDs", async () => {
  const logs: string[] = [],
    original = console.error;
  console.error = (line: string) => {
    logs.push(line);
  };
  try {
    let failure;
    try {
      check({
        message: "private content token email@example.test",
        code: "42P01",
      });
    } catch (e) {
      failure = e;
    }
    const response = errorResponse(failure, "api/content");
    const body = await response.json();
    const log = JSON.parse(logs[0]);
    assert.equal(response.status, 503);
    assert.equal(body.requestId, log.requestId);
    assert.equal(response.headers.get("X-Request-Id"), log.requestId);
    assert.equal(log.service, "database");
    assert.equal(log.code, "42P01");
    assert.equal(log.operation, "api/content");
    const other = await errorResponse(
      new Error("secret body token"),
      "api/admin/snapshot",
    ).json();
    errorResponse(
      new ServiceError("Auth unavailable", "auth", "private-code-token"),
      "api/admin/snapshot",
    );
    assert.doesNotMatch(
      JSON.stringify([logs, body, other]),
      /private content|email@example|secret body|private-code/,
    );
  } finally {
    console.error = original;
  }
});
test("database revision conflicts are 409 with safe recovery instructions", () => {
  assert.throws(
    () => check({ message: "Revision conflict", code: "P0001" }),
    (e: HttpError) => e.status === 409 && /saved copy/.test(e.message),
  );
});
test("only known missing or expired credentials are treated as guests", () => {
  assert.equal(isAbsentSession({ name: "AuthSessionMissingError" }), true);
  assert.equal(isAbsentSession({ code: "refresh_token_not_found" }), true);
  for (const code of [
    "request_timeout",
    "unexpected_failure",
    "over_request_rate_limit",
    "unknown",
  ])
    assert.equal(isAbsentSession({ code }), false);
});
test("Auth provider failure reaches the caller as unavailable, not a guest", async () => {
  const original = globalThis.fetch,
    environment = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "owner@example.test",
  });
  globalThis.fetch = async () =>
    Response.json(
      { code: "over_request_rate_limit", message: "private diagnostic" },
      { status: 429 },
    );
  try {
    await assert.rejects(
      actor("synthetic-token"),
      (e: ServiceError) =>
        e.status === 503 &&
        e.service === "auth" &&
        !e.message.includes("private"),
    );
  } finally {
    globalThis.fetch = original;
    process.env = environment;
  }
});
