import test from "node:test";
import assert from "node:assert/strict";
import { saveSettings } from "../../server/save-settings";
import { defaultSettings } from "../../lib/settings";
import type { User } from "../../lib/types";
const admin: User = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Admin",
  email: "admin@example.test",
  active: true,
  role: "admin",
  groups: [],
};

test("settings preserve the system-owned root reference and both revision guards", async () => {
  const previousFetch = globalThis.fetch,
    previousEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
    SUPABASE_SECRET_KEY: "synthetic",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
  });
  delete process.env.VERCEL_ENV;
  delete process.env.FIELDBOOK_ENVIRONMENT;
  let writes = 0,
    conflict = false;
  const config = {
    settings: { ...defaultSettings, organizationTeamId: "organization" },
    teams: [
      { id: "organization", name: "Organization", system: "organization" },
    ],
    groups: [],
    governance_revision: 11,
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.endsWith("fb_config"));
    if (init?.method === "PATCH") {
      writes++;
      assert.equal(url.searchParams.get("revision"), "eq.7");
      assert.equal(url.searchParams.get("governance_revision"), "eq.11");
      assert.equal(
        JSON.parse(String(init.body)).settings.organizationTeamId,
        "organization",
      );
      return Response.json(conflict ? null : { revision: 8 });
    }
    return Response.json(config);
  };
  try {
    for (const organizationTeamId of [null, "sales", "missing"])
      await assert.rejects(
        saveSettings(admin, {
          settings: { ...defaultSettings, organizationTeamId },
          expected: 7,
        }),
        (e: any) => e.status === 400 && /built-in/.test(e.message),
      );
    assert.equal(writes, 0);
    await saveSettings(admin, {
      settings: { ...defaultSettings, organizationTeamId: undefined },
      expected: 7,
    });
    await saveSettings(admin, {
      settings: { ...config.settings, name: "Changed identity" },
      expected: 7,
    });
    assert.equal(writes, 2);
    conflict = true;
    await assert.rejects(
      saveSettings(admin, { settings: config.settings, expected: 7 }),
      (e: any) => e.status === 409,
    );
    for (const role of ["learner", "manager", "contributor"] as const)
      await assert.rejects(
        saveSettings(
          { ...admin, role },
          { settings: config.settings, expected: 7 },
        ),
        (e: any) => e.status === 403,
      );
    delete (config as any).teams;
    await assert.rejects(
      saveSettings(admin, { settings: config.settings, expected: 7 }),
      (e: any) => e.status === 503 && /setup is incomplete/.test(e.message),
    );
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnv;
  }
});
