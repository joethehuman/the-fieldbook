import test from "node:test";
import assert from "node:assert/strict";
import { reviewDeadlines } from "../../server/deadlines";
import { HttpError } from "../../server/auth";
import type { User } from "../../lib/types";
const admin: User = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Admin",
  email: "admin@example.test",
  role: "admin",
  active: true,
  groups: [],
};
test("deadline review requires an administrator and a validated review token before any write", async () => {
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://deadlines.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
    SUPABASE_SECRET_KEY: "synthetic",
    FIELDBOOK_URL: "https://fieldbook.example",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
    FIELDBOOK_HOST: "node",
  });
  delete process.env.VERCEL_ENV;
  let calls = 0;
  let stale = false;
  const token = "a".repeat(32),
    result = {
      token,
      clocks: [],
      courses: [],
      onboardingDays: 90,
      catchUpDays: 7,
    };
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(
      new URL(String(input)).pathname,
      "/rest/v1/rpc/fb_review_deadlines",
    );
    const body = JSON.parse(String(init?.body));
    assert.equal(body.p_actor, admin.id);
    assert.equal(body.p_apply, !!body.p_token);
    if (stale)
      return Response.json(
        {
          code: "P0001",
          message:
            "People, assignments or settings changed. Review deadlines again",
        },
        { status: 400 },
      );
    return Response.json(result);
  };
  try {
    await assert.rejects(
      reviewDeadlines(null, {}),
      (e: HttpError) => e.status === 401,
    );
    await assert.rejects(
      reviewDeadlines({ ...admin, role: "manager" }, {}),
      (e: HttpError) => e.status === 403,
    );
    await assert.rejects(
      reviewDeadlines(admin, { token: "bad" }),
      (e: HttpError) => e.status === 400,
    );
    await assert.rejects(
      reviewDeadlines(admin, { apply: true }),
      (e: HttpError) => e.status === 400,
    );
    assert.equal(calls, 0);
    assert.deepEqual(await reviewDeadlines(admin, {}), result);
    assert.deepEqual(await reviewDeadlines(admin, { token }), result);
    stale = true;
    await assert.rejects(
      reviewDeadlines(admin, { token }),
      (e: HttpError) => e.status === 409,
    );
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
});
