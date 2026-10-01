import test from "node:test";
import assert from "node:assert/strict";
import { settingsSchema } from "../../server/schemas";
import { saveSettings } from "../../server/save-settings";
import { defaultSettings, publicSettings } from "../../lib/settings";
import { brandingFromSettings } from "../../lib/branding";
import { accountMenuLinks } from "../../lib/external-links";

const links = Array.from({ length: 3 }, (_, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`,
  label: ["Product docs", "Learning portal", "Company website"][index],
  url: `https://example.test/${index + 1}`,
}));

test("external links preserve ordered settings and existing-installation defaults", () => {
  assert.deepEqual(
    settingsSchema.parse({ ...defaultSettings, externalLinks: undefined })
      .externalLinks,
    [],
  );
  const settings = settingsSchema.parse({
    ...defaultSettings,
    externalLinks: links.map((link) => ({
      ...link,
      label: ` ${link.label} `,
      url: ` ${link.url} `,
    })),
  });
  assert.deepEqual(settings.externalLinks, links);
  assert.deepEqual(publicSettings(settings).externalLinks, links);
  assert.equal("externalLinks" in brandingFromSettings(settings), false);
});

test("external links reject oversized, unsafe or incomplete settings at the server boundary", () => {
  for (const externalLinks of [
    [...links, { ...links[0], id: "00000000-0000-4000-8000-000000000004" }],
    [links[0], links[0]],
    [{ ...links[0], id: "invalid" }],
    [{ ...links[0], label: " " }],
    [{ ...links[0], label: "a".repeat(41) }],
    ...[
      "",
      "/docs",
      "//example.test",
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///tmp/test",
      "https://user:secret@example.test",
      "https://example.test/with spaces",
      "https://example.test/" + "a".repeat(2000),
    ].map((url) => [{ ...links[0], url }]),
  ]) {
    assert.equal(
      settingsSchema.safeParse({ ...defaultSettings, externalLinks }).success,
      false,
    );
  }
  assert.equal(
    settingsSchema.safeParse({
      ...defaultSettings,
      externalLinks: [{ ...links[0], url: "http://localhost:3000/docs#start" }],
    }).success,
    true,
  );
  assert.deepEqual(
    accountMenuLinks([
      { ...links[0], url: "javascript:alert(1)" },
      ...links,
      { ...links[0], id: "fourth" },
    ]),
    links,
  );
  assert.deepEqual(accountMenuLinks(null), []);
});

test("only administrators can save links, using the existing revision-controlled settings write", async () => {
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
  const writes: any[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("fb_config") && init?.method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      writes.push({ body, url });
      return Response.json(
        url.searchParams.get("revision") === "eq.7" ? { revision: 8 } : null,
      );
    }
    if (url.pathname.endsWith("fb_config"))
      return Response.json({
        settings: defaultSettings,
        revision: 7,
        governance_revision: 9,
        groups: [],
      });
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  const admin: any = {
    id: links[0].id,
    name: "Admin",
    email: "admin@example.test",
    active: true,
    role: "admin",
    groups: [],
  };
  try {
    for (const user of [
      null,
      { ...admin, role: "learner" },
      { ...admin, role: "manager" },
    ])
      await assert.rejects(
        saveSettings(user, {
          settings: { ...defaultSettings, externalLinks: links },
          expected: 7,
        }),
        (error: any) => [401, 403].includes(error.status),
      );
    assert.equal(writes.length, 0);
    const result = await saveSettings(admin, {
      settings: { ...defaultSettings, externalLinks: links },
      expected: 7,
    });
    assert.equal(result.revision, 8);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].body.settings.externalLinks, links);
    assert.equal(writes[0].url.searchParams.get("revision"), "eq.7");
    assert.equal(writes[0].url.searchParams.get("governance_revision"), "eq.9");
    await assert.rejects(
      saveSettings(admin, {
        settings: { ...defaultSettings, externalLinks: links },
        expected: 6,
      }),
      (error: any) => error.status === 409,
    );
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnv;
  }
});
