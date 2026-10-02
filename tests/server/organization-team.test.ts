import test from "node:test";
import assert from "node:assert/strict";
import { saveSettings } from "../../server/save-settings";
import { defaultSettings } from "../../lib/settings";
import type { ConfigurationRecord } from "../../server/ports/data";
import type { User } from "../../lib/types";

const admin: User = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Admin",
  email: "admin@example.test",
  active: true,
  role: "admin",
  groups: [],
};
const initial: ConfigurationRecord = {
  settings: { ...defaultSettings },
  groups: [],
  teams: [
    { id: "organization", name: "Company" },
    { id: "sales", name: "Sales", parentId: "organization" },
  ],
  curricula: [],
  revision: 7,
  governance_revision: 11,
};

test("Organization team settings validate against teams and retain both revision guards", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
    SUPABASE_SECRET_KEY: "synthetic",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
  });
  delete process.env.VERCEL_ENV;
  delete process.env.FIELDBOOK_ENVIRONMENT;
  let config = structuredClone(initial);
  let race = false;
  const requests: { url: URL; method: string }[] = [];
  const writes: {
    settings: ConfigurationRecord["settings"];
    revision: number;
  }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || "GET";
    requests.push({ url, method });
    assert.ok(url.pathname.endsWith("fb_config"));
    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      writes.push(body);
      assert.equal(url.searchParams.get("id"), "eq.true");
      if (
        url.searchParams.get("revision") !== `eq.${config.revision}` ||
        url.searchParams.get("governance_revision") !==
          `eq.${config.governance_revision}`
      )
        return Response.json(null);
      config.settings = body.settings;
      config.revision = body.revision;
      return Response.json({ revision: config.revision });
    }
    assert.equal(
      url.searchParams.get("select"),
      "settings,groups,teams,governance_revision",
    );
    const snapshot = structuredClone(config);
    if (race) {
      config.governance_revision++;
      config.teams.push({ id: "support", name: "Support" });
    }
    return Response.json(snapshot);
  };
  const reset = () => {
    config = structuredClone(initial);
    race = false;
    requests.length = 0;
    writes.length = 0;
  };
  try {
    await t.test(
      "only an administrator may designate or clear the team",
      async () => {
        for (const role of ["learner", "manager", "contributor"] as const)
          await assert.rejects(
            saveSettings(
              { ...admin, role },
              {
                settings: {
                  ...defaultSettings,
                  organizationTeamId: "organization",
                },
                expected: 7,
              },
            ),
            (error: any) => error.status === 403,
          );
        await assert.rejects(
          saveSettings(null, { settings: defaultSettings, expected: 7 }),
          (error: any) => error.status === 401,
        );
        assert.equal(requests.length, 0);
      },
    );
    await t.test(
      "valid designation changes settings alone using both revision guards",
      async () => {
        reset();
        const teams = structuredClone(config.teams);
        const result = await saveSettings(admin, {
          settings: { ...defaultSettings, organizationTeamId: "organization" },
          expected: 7,
        });
        assert.equal(result.revision, 8);
        assert.equal(config.settings.organizationTeamId, "organization");
        assert.deepEqual(config.teams, teams);
        assert.equal(writes.length, 1);
        const patch = requests.find((request) => request.method === "PATCH")!;
        assert.equal(patch.url.searchParams.get("revision"), "eq.7");
        assert.equal(
          patch.url.searchParams.get("governance_revision"),
          "eq.11",
        );
        assert.deepEqual(Object.keys(writes[0]).sort(), [
          "revision",
          "settings",
        ]);
      },
    );
    await t.test(
      "new missing, parented and multiple-root designations are rejected",
      async () => {
        for (const selected of [
          "missing",
          "sales",
          "Company",
          "organization",
        ]) {
          reset();
          if (selected === "organization")
            config.teams.push({ id: "support", name: "Support" });
          await assert.rejects(
            saveSettings(admin, {
              settings: { ...defaultSettings, organizationTeamId: selected },
              expected: 7,
            }),
            (error: any) =>
              error.status === 400 && /only top-level team/.test(error.message),
          );
          assert.equal(writes.length, 0);
        }
      },
    );
    await t.test(
      "unrelated saves preserve unchanged stale designations",
      async () => {
        for (const selected of ["missing", "sales", "organization"]) {
          reset();
          if (selected === "organization")
            config.teams.push({ id: "support", name: "Support" });
          config.settings.organizationTeamId = selected;
          await saveSettings(admin, {
            settings: { ...config.settings, name: "Updated identity" },
            expected: 7,
          });
          assert.equal(config.settings.organizationTeamId, selected);
          assert.equal(config.settings.name, "Updated identity");
        }
      },
    );
    await t.test(
      "an administrator can explicitly clear a stale designation",
      async () => {
        reset();
        config.settings.organizationTeamId = "missing";
        await saveSettings(admin, {
          settings: { ...config.settings, organizationTeamId: null },
          expected: 7,
        });
        assert.equal(config.settings.organizationTeamId, null);
      },
    );
    await t.test(
      "concurrent hierarchy changes invalidate designation instead of hiding another root",
      async () => {
        reset();
        race = true;
        await assert.rejects(
          saveSettings(admin, {
            settings: {
              ...defaultSettings,
              organizationTeamId: "organization",
            },
            expected: 7,
          }),
          (error: any) => error.status === 409,
        );
        assert.equal(config.settings.organizationTeamId, null);
        assert.equal(config.revision, 7);
        assert.equal(config.teams.length, 3);
      },
    );
    await t.test(
      "stale settings revisions fail without changing the designation",
      async () => {
        reset();
        await assert.rejects(
          saveSettings(admin, {
            settings: {
              ...defaultSettings,
              organizationTeamId: "organization",
            },
            expected: 6,
          }),
          (error: any) => error.status === 409,
        );
        assert.equal(config.settings.organizationTeamId, null);
        assert.equal(config.revision, 7);
      },
    );
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnv;
  }
});
