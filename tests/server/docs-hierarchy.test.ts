import test from "node:test";
import assert from "node:assert/strict";
import { settingsSchema } from "../../server/schemas";
import { saveSettings } from "../../server/save-settings";
import { saveContent } from "../../server/content";
import { defaultSettings } from "../../lib/settings";
import { seedContent } from "../../lib/seed";

const admin = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Admin",
  email: "admin@example.test",
  role: "admin" as const,
  groups: [],
  active: true,
};
const id = "00000000-0000-4000-8000-000000000002";
const legacy = {
  ...seedContent.find((item) => item.kind === "doc")!,
  id,
  category: "Start",
  folder: "",
};
const section = { id: "legacy:Start:", name: "Start", legacyCategory: "Start" };

test("server schema rejects cycles, third levels, duplicate siblings and invalid parents", () => {
  const parse = (docSections: unknown) =>
    settingsSchema.safeParse({ ...defaultSettings, docSections }).success;
  assert.equal(
    parse([section, { id: "child", name: "Install", parentId: section.id }]),
    true,
  );
  assert.equal(
    parse([
      section,
      { id: "child", name: "Install", parentId: section.id },
      { id: "third", name: "Linux", parentId: "child" },
    ]),
    false,
  );
  assert.equal(parse([{ ...section, docOrder: [id] }]), true);
  assert.equal(parse([{ ...section, docOrder: [id, id] }]), false);
  assert.equal(parse([{ ...section, docOrder: [""] }]), false);
  assert.equal(
    parse([section, { id: "child", name: "Install", parentId: "child" }]),
    false,
  );
  assert.equal(
    parse([section, { id: "child", name: "Install", parentId: "missing" }]),
    false,
  );
  assert.equal(
    parse([
      section,
      { id: "child", name: "Install", parentId: section.id },
      { id: "same", name: "install", parentId: section.id },
    ]),
    false,
  );
});

test("admin settings guard draft and published placement; content write validates section IDs", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
  });
  const systemSettings = {
    ...defaultSettings,
    organizationTeamId: "organization",
  };
  const teams = [
    { id: "organization", name: "Organization", system: "organization" },
  ];
  let settings: any = { ...systemSettings, docCategoryOrder: ["Start"] };
  let writes = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || "GET";
    let body: unknown;
    if (url.pathname.endsWith("fb_config")) {
      if (method === "PATCH") {
        writes++;
        settings = JSON.parse(String(init?.body)).settings;
        body = { revision: 2 };
      } else body = { settings, teams, groups: [], governance_revision: 1 };
    } else if (url.pathname.endsWith("fb_documents")) {
      body = url.searchParams.has("id")
        ? { draft: legacy, published: legacy, revision: 1 }
        : [{ id, draft: legacy, published: legacy }];
    } else throw new Error("Unexpected request " + url.pathname);
    return new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json",
        ...(Array.isArray(body) ? { "Content-Range": "0-0/1" } : {}),
      },
    });
  };
  try {
    await assert.rejects(
      () =>
        saveSettings(null, {
          settings: { ...systemSettings, docSections: [] },
          expected: 1,
        }),
      /Sign in/,
    );
    await assert.rejects(
      () =>
        saveSettings(admin, {
          settings: {
            ...systemSettings,
            docCategoryOrder: [],
            docSections: [],
          },
          expected: 1,
        }),
      /draft and published documents/,
    );
    assert.equal(writes, 0);
    await saveSettings(admin, {
      settings: {
        ...systemSettings,
        docCategoryOrder: [],
        docSections: [{ ...section, name: "Begin", docOrder: [id] }],
      },
      expected: 1,
    });
    assert.equal(writes, 1);
    assert.equal(settings.docSections[0].name, "Begin");
    assert.deepEqual(settings.docSections[0].docOrder, [id]);
    await assert.rejects(
      () =>
        saveSettings(
          { ...admin, role: "contributor" },
          { settings, expected: 2 },
        ),
      /administrator/i,
    );
    assert.equal(writes, 1);
    await assert.rejects(
      () =>
        saveContent(
          admin,
          {
            ...legacy,
            sectionId: "missing",
          },
          1,
        ),
      /existing Docs section/,
    );
    assert.equal(writes, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
