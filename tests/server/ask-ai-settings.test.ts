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
    model: "test/primary",
    guidance: "Operator guidance",
  };
  const writes: any[] = [];
  const organizationTeamId = "00000000-0000-4000-8000-000000000090";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.endsWith("fb_config"));
    if (init?.method === "PATCH") {
      writes.push(JSON.parse(String(init.body)));
      assert.equal(writes.at(-1).settings.organizationTeamId, organizationTeamId);
      assert.equal(url.searchParams.get("governance_revision"), "eq.9");
      return Response.json(
        url.searchParams.get("revision") === "eq.7" ? { revision: 8 } : null,
      );
    }
    return Response.json({
      settings: { ...defaultSettings, askAi: configured, organizationTeamId },
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
    const saved = await saveSettings(admin, {
      settings: { ...defaultSettings, organizationTeamId: "client-cannot-replace-it" },
      expected: 7,
    });
    assert.equal(saved.settings.organizationTeamId, organizationTeamId);
    await assert.rejects(
      saveSettings(admin, { settings: defaultSettings, expected: 6 }),
      { status: 409 },
    );
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
});

test("Enabling validates model and both retrieval functions; disabling needs no Gateway and conflicts preserve settings", async () => {
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
    SUPABASE_SECRET_KEY: "synthetic",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
  });
  for (const key of [
    "AI_GATEWAY_API_KEY",
    "VERCEL_OIDC_TOKEN",
    "VERCEL",
    "VERCEL_ENV",
    "FIELDBOOK_ENVIRONMENT",
  ])
    delete process.env[key];
  let ready = false,
    writes = 0,
    generations = 0,
    catalogReads = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.host === "ai-gateway.vercel.sh") {
      if (url.pathname !== "/v1/models") {
        generations++;
        throw Error("Unexpected generation");
      }
      catalogReads++;
      return Response.json({
        data: [{ id: "test/valid", type: "language", tags: ["tool-use"] }],
      });
    }
    if (url.pathname.endsWith("fb_ai_passages"))
      return ready
        ? Response.json([])
        : Response.json(
            { code: "PGRST202", message: "synthetic missing function" },
            { status: 404 },
          );
    if (url.pathname.endsWith("fb_ai_sources_current"))
      return Response.json(true);
    assert.ok(url.pathname.endsWith("fb_config"));
    if (init?.method === "PATCH") {
      if (url.searchParams.get("revision") !== "eq.7")
        return Response.json(null);
      writes++;
      return Response.json({ revision: 8 });
    }
    return Response.json({
      settings: defaultSettings,
      groups: [],
      governance_revision: 9,
    });
  };
  const admin: any = { id: "admin", role: "admin", active: true, groups: [] };
  const enabled = {
    ...defaultAskAiSettings,
    enabled: true,
    model: "test/valid",
  };
  try {
    await assert.rejects(
      saveSettings(admin, {
        settings: { ...defaultSettings, askAi: enabled },
        expected: 7,
      }),
      { status: 503 },
    );
    assert.equal(catalogReads, 0);
    process.env.AI_GATEWAY_API_KEY = "synthetic-only";
    await assert.rejects(
      saveSettings(admin, {
        settings: {
          ...defaultSettings,
          askAi: { ...enabled, model: "test/unavailable" },
        },
        expected: 7,
      }),
      { status: 503 },
    );
    await assert.rejects(
      saveSettings(admin, {
        settings: { ...defaultSettings, askAi: enabled },
        expected: 7,
      }),
      { status: 503 },
    );
    assert.equal(writes, 0);
    await assert.rejects(
      saveSettings(admin, {
        settings: {
          ...defaultSettings,
          askAi: { ...enabled, fallbackModel: "test/unavailable" },
        },
        expected: 7,
      }),
      { status: 503 },
    );
    await assert.rejects(
      saveSettings(admin, {
        settings: {
          ...defaultSettings,
          askAi: { ...enabled, fallbackModel: enabled.model },
        },
        expected: 7,
      }),
      { status: 400 },
    );
    await assert.rejects(
      saveSettings(admin, {
        settings: { ...defaultSettings, askAi: { ...enabled, model: "" } },
        expected: 7,
      }),
      { status: 400 },
    );
    assert.equal(writes, 0);
    ready = true;
    await saveSettings(admin, {
      settings: { ...defaultSettings, askAi: enabled },
      expected: 7,
    });
    assert.equal(writes, 1);
    await assert.rejects(
      saveSettings(admin, {
        settings: { ...defaultSettings, askAi: enabled },
        expected: 6,
      }),
      { status: 409 },
    );
    assert.equal(writes, 1);
    delete process.env.AI_GATEWAY_API_KEY;
    await saveSettings(admin, {
      settings: { ...defaultSettings, askAi: { ...enabled, enabled: false } },
      expected: 7,
    });
    assert.equal(writes, 2);
    assert.equal(generations, 0);
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
});
