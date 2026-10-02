import test from "node:test";
import assert from "node:assert/strict";
import { guestFixture } from "../guest-fixture";
import { snapshot } from "../../server/snapshot";
import { saveSettings } from "../../server/save-settings";
import { recordProgress } from "../../server/progress";
import { assignedCourses } from "../../lib/types";

test("real snapshot/progress/settings boundaries with synthetic PostgREST: no anonymous governance or writes", async () => {
  const originalFetch = globalThis.fetch,
    originalEnv = { ...process.env };
  let data = guestFixture(),
    conflict = false;
  data.settings!.organizationTeamId = "private-organization-team";
  const requests: { url: URL; method: string }[] = [];
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)),
      method = init?.method || "GET";
    requests.push({ url, method });
    let body: unknown;
    if (url.pathname.endsWith("fb_config")) {
      if (method === "PATCH") {
        assert.equal(url.searchParams.get("governance_revision"), "eq.1");
        assert.equal(url.searchParams.get("revision"), "eq.1");
        if (conflict) body = null;
        else {
          data.settings = JSON.parse(String(init?.body)).settings;
          body = { revision: 2 };
        }
      } else body = { ...data, governance_revision: 1 };
    } else if (url.pathname.endsWith("fb_documents")) {
      const rows = data.content.map((c) => ({
        id: c.id,
        updated_at: c.updatedAt,
        revision: 1,
        published_revision: 1,
        published: c.status === "published" ? c : null,
        draft: { ...c, title: "SECRET DRAFT" },
      }));
      body = url.searchParams.has("id")
        ? rows.find((r) => "eq." + r.id === url.searchParams.get("id"))
        : rows.filter((r) => r.published);
    } else throw new Error("Unexpected guest request: " + url.pathname);
    return new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json",
        ...(Array.isArray(body)
          ? { "Content-Range": `0-${body.length - 1}/${body.length}` }
          : {}),
      },
    });
  };
  try {
    const before = JSON.stringify(data.users),
      guest = await snapshot(null);
    assert.equal(
      assignedCourses(guest.content, guest.users[0], guest.groups).length,
      2,
    );
    assert.equal(guest.content[0].questions[0].answer, undefined);
    assert.deepEqual(guest.teams, []);
    assert.deepEqual(guest.feedback, []);
    assert.deepEqual(guest.progress, {});
    assert.equal(guest.governanceRevision, undefined);
    assert.equal(guest.revision, undefined);
    assert.equal("organizationTeamId" in guest.settings!, false);
    assert.ok(!JSON.stringify(guest).includes("private-organization-team"));
    assert.ok(!JSON.stringify(guest).includes("SECRET"));
    assert.ok(!JSON.stringify(guest).includes(data.users[0].email));
    assert.equal(requests.length, 2);
    assert.ok(requests.every((r) => r.method === "GET"));
    const course = guest.content[0];
    const result = await recordProgress(null, {
      contentId: course.id,
      version: course.version,
      lessons: ["lesson"],
      answers: [0],
    });
    assert.equal(result.passed, false);
    assert.equal(result.attemptPassed, true);
    const failedFinish = await recordProgress(null, {
      contentId: course.id,
      version: course.version,
      lessons: ["lesson"],
      answers: [1],
      complete: true,
    });
    assert.equal(failedFinish.passed, false);
    assert.equal(failedFinish.attemptPassed, false);
    assert.equal(failedFinish.attempts.length, 1);
    const passedFinish = await recordProgress(null, {
      contentId: course.id,
      version: course.version,
      lessons: ["lesson"],
      answers: [0],
      complete: true,
    });
    assert.equal(passedFinish.passed, true);
    assert.ok(requests.every((r) => r.method === "GET"));
    assert.equal(JSON.stringify(data.users), before);
    const admin = { ...data.users[0], role: "admin" as const };
    await assert.rejects(
      saveSettings(null, { settings: data.settings, expected: 1 }),
      /Sign in/,
    );
    await assert.rejects(
      saveSettings(data.users[0], { settings: data.settings, expected: 1 }),
      /Administrator/,
    );
    await assert.rejects(
      saveSettings(admin, {
        settings: { ...data.settings, guestGroupId: "missing" },
        expected: 1,
      }),
      /unavailable/,
    );
    await saveSettings(admin, {
      settings: { ...data.settings, guestGroupId: "foundation" },
      expected: 1,
    });
    assert.equal(data.settings!.guestGroupId, "foundation");
    conflict = true;
    await assert.rejects(
      saveSettings(admin, {
        settings: { ...data.settings, guestGroupId: "visitors" },
        expected: 1,
      }),
      /changed/,
    );
    conflict = false;
    await saveSettings(admin, {
      settings: { ...data.settings, access: "private" },
      expected: 1,
    });
    assert.equal(data.settings!.guestGroupId, "foundation");
    const count = requests.length;
    await assert.rejects(snapshot(null), /Sign in/);
    assert.equal(requests.length, count + 1);
    await assert.rejects(
      recordProgress(null, {
        contentId: course.id,
        version: course.version,
        lessons: ["lesson"],
      }),
      /Sign in/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
