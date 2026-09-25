import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/auth/sign-in/route";
import { SIGN_IN_RETURN_COOKIE } from "../lib/sign-in";
import { organizationHomePath } from "../../lib/navigation";

test("sign-in hides the return path while remembering docs, query and anchor", () => {
  const next = "/docs?topic=setup#google";
  const response = GET(
    new Request(
      `https://fieldbook.example/auth/sign-in?next=${encodeURIComponent(next)}`,
    ),
  );
  assert.equal(
    response.headers.get("location"),
    "https://fieldbook.example/sign-in",
  );
  const cookie = response.cookies.get(SIGN_IN_RETURN_COOKIE);
  assert.equal(cookie?.value, next);
  assert.equal(cookie?.httpOnly, true);
  assert.equal(cookie?.secure, true);
  assert.equal(cookie?.sameSite, "lax");
  assert.equal(cookie?.maxAge, 600);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("sign-in rejects external return destinations and defaults to home", () => {
  for (const next of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "",
  ]) {
    const response = GET(
      new Request(
        `https://fieldbook.example/auth/sign-in?next=${encodeURIComponent(next)}`,
      ),
    );
    assert.equal(
      response.cookies.get(SIGN_IN_RETURN_COOKIE)?.value,
      organizationHomePath,
    );
  }
});
