import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../../app/auth/sign-in/route";
import { requestMatchesOrigin } from "../../server/deployment";

test("standalone sign-in uses its public origin without a canonical redirect loop", () => {
  const saved = process.env;
  process.env = {
    NODE_ENV: "test",
    FIELDBOOK_HOST: "node",
    FIELDBOOK_URL: "https://learn.example.test",
    FIELDBOOK_OWNER_EMAIL: "owner@example.test",
  };
  try {
    const request = new Request(
      "https://0.0.0.0:8080/auth/sign-in?next=/docs/example",
      { headers: { host: "learn.example.test" } },
    );
    assert.equal(
      requestMatchesOrigin(request, "https://learn.example.test"),
      true,
    );
    const response = GET(request);
    assert.equal(
      response.headers.get("location"),
      "https://learn.example.test/sign-in",
    );
    for (const flag of [/\bHttpOnly\b/, /\bSecure\b/, /SameSite=lax/]) {
      assert.match(response.headers.get("set-cookie")!, flag);
    }
    for (const host of [
      "alias.example.test",
      "evil.example.test",
      "learn.example.test, evil.example.test",
    ]) {
      const alias = new Request(request.url, {
        headers: { host, "x-forwarded-host": "learn.example.test" },
      });
      assert.equal(
        requestMatchesOrigin(alias, "https://learn.example.test"),
        false,
      );
      const redirected = GET(alias);
      assert.equal(
        redirected.headers.get("location"),
        "https://learn.example.test/auth/sign-in?next=%2Fdocs%2Fexample",
      );
      assert.equal(redirected.headers.get("set-cookie"), null);
    }
    process.env.FIELDBOOK_HOST = "vercel";
    assert.equal(
      requestMatchesOrigin(request, "https://learn.example.test"),
      false,
    );
    assert.equal(
      requestMatchesOrigin(
        new Request("https://learn.example.test/auth/sign-in"),
        "https://learn.example.test",
      ),
      true,
    );
  } finally {
    process.env = saved;
  }
});
