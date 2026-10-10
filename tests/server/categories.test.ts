import test from "node:test";
import assert from "node:assert/strict";
import { data } from "../../server/data";
import { saveSettings } from "../../server/save-settings";
import { saveContent } from "../../server/content";
import { adminSnapshot } from "../../server/admin-snapshot";
import { settingsSchema } from "../../server/schemas";
import { defaultSettings } from "../../lib/settings";
import { seedContent } from "../../lib/seed";
import type { User } from "../../lib/types";

const admin: User = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Admin",
  email: "admin@example.test",
  active: true,
  role: "admin",
  groups: [],
};
const contributor = { ...admin, role: "contributor" as const };
const source = {
  ...seedContent.find((item) => item.kind === "course")!,
  id: "22222222-2222-4222-8222-222222222222",
  category: "Source",
};
const settings = {
  ...defaultSettings,
  organizationTeamId: "organization",
  contentCategories: { course: ["Source", "Empty"], brief: ["Source"] },
};

test("category schema validates names independently for each content type", () => {
  assert(settingsSchema.safeParse(settings).success);
  assert(
    !settingsSchema.safeParse({
      ...settings,
      contentCategories: { course: ["Product", "product"], brief: [] },
    }).success,
  );
  assert(
    !settingsSchema.safeParse({
      ...settings,
      contentCategories: { course: [""], brief: [] },
    }).success,
  );
});

test("settings removal guards actual draft and published categories, preserves older clients, and requires admin", async () => {
  const store = data(),
    original = { ...store };
  let writes = 0;
  Object.assign(store, {
    readSettingsContext: async () => ({
      settings,
      groups: [],
      teams: [
        { id: "organization", name: "Organization", system: "organization" },
      ],
      governance_revision: 1,
    }),
    listDocumentPlacements: async () => [
      {
        id: source.id,
        draft: { ...source, category: "Empty" },
        published: source,
      },
    ],
    updateSettings: async (next: typeof settings) => {
      writes++;
      assert.deepEqual(next.contentCategories, settings.contentCategories);
      return { revision: 2 };
    },
  });
  try {
    await assert.rejects(
      () =>
        saveSettings(admin, {
          expected: 1,
          settings: {
            ...settings,
            contentCategories: { course: ["Empty"], brief: ["Source"] },
          },
        }),
      /published copy/,
    );
    assert.equal(writes, 0);
    const { contentCategories: _categories, ...older } = settings;
    await saveSettings(admin, { expected: 1, settings: older });
    assert.equal(writes, 1);
    await assert.rejects(
      () => saveSettings(contributor, { expected: 1, settings }),
      /Administrator/,
    );
    assert.equal(writes, 1);
  } finally {
    Object.assign(store, original);
  }
});

test("web and MCP content saves reject removed categories before a mutation", async () => {
  const store = data(),
    original = { ...store };
  let writes = 0;
  Object.assign(store, {
    readSettings: async () => ({ settings }),
    saveDocument: async () => {
      writes++;
      throw new Error("Should not write");
    },
  });
  try {
    for (const actor of [admin, contributor])
      await assert.rejects(
        () =>
          saveContent(
            actor,
            { ...source, category: "Retired", status: "draft" },
            1,
            false,
          ),
        /no longer available/,
      );
    assert.equal(writes, 0);
  } finally {
    Object.assign(store, original);
  }
});

test("category scope returns actual published labels without bodies and denies contributors", async () => {
  const store = data(),
    original = { ...store };
  let reads = 0;
  Object.assign(store, {
    readConfiguration: async () => ({
      settings,
      revision: 1,
      governance_revision: 1,
      groups: [],
      teams: [],
      curricula: [],
    }),
    listDraftIndex: async () => [
      {
        ...source,
        revision: 4,
        published_revision: 3,
        updated_at: source.updatedAt,
        category: "Empty",
      },
    ],
    listDocumentPlacements: async () => {
      reads++;
      return [
        {
          id: source.id,
          draft: { ...source, category: "Empty" },
          published: { ...source, body: "Private publication body" },
        },
      ];
    },
  });
  try {
    await assert.rejects(
      () => adminSnapshot(contributor, "categories"),
      /Administrator/,
    );
    assert.equal(reads, 0);
    const snapshot = await adminSnapshot(admin, "categories");
    assert.equal(snapshot.content[0].category, "Empty");
    assert.equal(snapshot.publishedContent![0].category, "Source");
    assert.equal(snapshot.publishedContent![0].body, "");
    assert.deepEqual(snapshot.publishedContent![0].lessons, []);
    assert.equal(reads, 1);
  } finally {
    Object.assign(store, original);
  }
});
