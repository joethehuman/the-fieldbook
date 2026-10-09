import test from "node:test";
import assert from "node:assert/strict";
import { saveContent } from "../../server/content";
import { data as dataStore } from "../../server/data";
import { seedContent } from "../../lib/seed";
import { defaultSettings } from "../../lib/settings";
import type { Content, User } from "../../lib/types";
import type { DocumentRecord } from "../../server/ports/data";

test("publisher corrections preserve authoritative Update freshness; renewal is deliberate and revision checked", async () => {
  const store = dataStore(),
    originalStore = { ...store };
  const user: User = {
    id: "00000000-0000-4000-8000-000000000010",
    name: "Publisher",
    email: "publisher@example.test",
    role: "contributor",
    groups: [],
    active: true,
  };
  const initial: Content = {
    ...seedContent.find((item) => item.kind === "brief")!,
    id: "00000000-0000-4000-8000-000000000011",
    groups: [],
    assignments: [],
    updatedAt: "2026-01-02T00:00:00.000Z",
    feedAt: "2026-01-01T00:00:00.000Z",
  };
  let row: DocumentRecord = {
    id: initial.id,
    draft: initial,
    published: initial,
    revision: 1,
    published_revision: 1,
    updated_at: initial.updatedAt,
  };
  let writes = 0;
  Object.assign(store, {
    readSettings: async () => ({ settings: defaultSettings }),
    findDocument: async () => row,
    saveDocument: async (write: any) => {
      assert.equal(write.expected, row.revision);
      writes++;
      row = {
        ...row,
        draft: write.draft,
        published: write.publish ? write.draft : row.published,
        revision: row.revision + 1,
        published_revision: write.publish
          ? row.revision + 1
          : row.published_revision,
      };
      return row;
    },
  });
  try {
    await assert.rejects(
      saveContent({ ...user, role: "learner" }, initial, 1, true),
      /publisher|administrator/i,
    );
    await assert.rejects(
      saveContent(user, initial, 0, true, "web", false, { renewUpdate: true }),
      /changed since/i,
    );
    await assert.rejects(
      saveContent(user, initial, 1, false, "web", false, { renewUpdate: true }),
      /Only publishing an Update/,
    );
    await assert.rejects(
      saveContent(user, { ...initial, kind: "course" }, 1, true, "web", false, {
        renewUpdate: true,
      }),
      /Only publishing an Update/,
    );
    assert.equal(writes, 0);
    const live = structuredClone(row.published);
    const draft = await saveContent(
      user,
      {
        ...initial,
        body: "Corrected typo",
        feedAt: "2099-01-01T00:00:00.000Z",
      },
      1,
    );
    assert.deepEqual(row.published, live);
    const correction = await saveContent(user, draft, 2, true);
    assert.equal(row.published!.body, "Corrected typo");
    assert.equal(correction.feedAt, initial.feedAt);
    assert.notEqual(correction.updatedAt, initial.updatedAt);
    assert.equal(correction.version, initial.version);
    const renewed = await saveContent(user, correction, 3, true, "web", false, {
      renewUpdate: true,
    });
    assert.equal(renewed.feedAt, renewed.updatedAt);
    assert.notEqual(renewed.feedAt, initial.feedAt);
    assert.equal("renewUpdate" in row.draft, false);
    const nextCorrection = await saveContent(
      user,
      { ...renewed, summary: "A further correction" },
      4,
      true,
    );
    assert.equal(nextCorrection.feedAt, renewed.feedAt);
    // Legacy records have no feedAt: preserve their previous published edit date.
    row.published = {
      ...row.published!,
      feedAt: undefined,
      updatedAt: initial.updatedAt,
    };
    const legacy = await saveContent(user, row.draft, 5, true);
    assert.equal(legacy.feedAt, initial.updatedAt);
    // No live publication: publish the first copy as current without a checkbox.
    row.published = null;
    row.published_revision = null;
    const first = await saveContent(user, legacy, 6, true);
    assert.equal(first.feedAt, first.updatedAt);
  } finally {
    Object.assign(store, originalStore);
  }
});
