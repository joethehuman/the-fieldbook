import test from "node:test";
import assert from "node:assert/strict";
import { saveSettings } from "../../server/save-settings";
import { defaultSettings } from "../../lib/settings";
import { defaultAskAiSettings } from "../../lib/ai";

test("revision-checked Admin settings preserve omitted AI configuration and permit explicit disable", async () => {
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
    SUPABASE_SECRET_KEY: "synthetic",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
  });
  delete process.env.VERCEL_ENV;
  delete process.env.FIELDBOOK_ENVIRONMENT;
  const configured = {
    ...defaultAskAiSettings,
    enabled: true,
    guidance: "Operator guidance",
  };
  const writes: any[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.endsWith("fb_config"));
    if (init?.method === "PATCH") {
      writes.push(JSON.parse(String(init.body)));
      assert.equal(url.searchParams.get("governance_revision"), "eq.9");
      return Response.json(
        url.searchParams.get("revision") === "eq.7" ? { revision: 8 } : null,
      );
    }
    return Response.json({
      settings: { ...defaultSettings, askAi: configured },
      revision: 7,
      governance_revision: 9,
      groups: [],
    });
  };
  const admin: any = { id: "admin", role: "admin", active: true, groups: [] };
  try {
    await assert.rejects(
      saveSettings(
        { ...admin, role: "learner" },
        { settings: { ...defaultSettings, askAi: configured }, expected: 7 },
      ),
      { status: 403 },
    );
    await saveSettings(admin, { settings: defaultSettings, expected: 7 });
    assert.deepEqual(writes[0].settings.askAi, configured);
    await saveSettings(admin, {
      settings: {
        ...defaultSettings,
        askAi: { ...configured, enabled: false },
      },
      expected: 7,
    });
    assert.equal(writes[1].settings.askAi.enabled, false);
    await assert.rejects(
      saveSettings(admin, { settings: defaultSettings, expected: 6 }),
      { status: 409 },
    );
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
});
