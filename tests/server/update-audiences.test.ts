import test from "node:test";
import assert from "node:assert/strict";
import { saveContent, redact } from "../../server/content";
import { data as dataStore } from "../../server/data";
import { defaultSettings } from "../../lib/settings";
import { seedContent } from "../../lib/seed";
import type { Content, User } from "../../lib/types";
import type { DocumentRecord } from "../../server/ports/data";
const admin: User = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "Admin",
  email: "admin@example.test",
  role: "admin",
  active: true,
  groups: [],
};
test("publisher Update team targeting validates current teams and revisions; draft saves retain the published audience", async () => {
  const store = dataStore(),
    old = { ...store };
  const original: Content = {
    ...seedContent.find((c) => c.kind === "brief")!,
    id: "00000000-0000-4000-8000-000000000011",
    groups: [],
    assignments: [],
  };
  let row: DocumentRecord = {
    id: original.id,
    draft: original,
    published: original,
    revision: 1,
    published_revision: 1,
    updated_at: original.updatedAt,
  };
  let writes = 0;
  Object.assign(store, {
    readSettings: async () => ({ settings: defaultSettings, revision: 1 }),
    readConfiguration: async () => ({
      settings: defaultSettings,
      revision: 1,
      governance_revision: 1,
      groups: [],
      teams: [{ id: "org", name: "Organization", system: "organization" }],
      curricula: [],
    }),
    findDocument: async () => row,
    saveDocument: async (write: any) => {
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
      saveContent(
        { ...admin, role: "learner" },
        { ...original, updateTeams: ["org"] },
        1,
      ),
      /administrator|publisher/i,
    );
    await assert.rejects(
      saveContent(admin, { ...original, updateTeams: ["missing"] }, 1),
      /team changed/i,
    );
    await assert.rejects(
      saveContent(admin, { ...original, updateTeams: ["org"] }, 0),
      /changed since/i,
    );
    assert.equal(writes, 0);
    await assert.rejects(
      saveContent(
        { ...admin, role: "contributor" },
        { ...original, updateTeams: ["org"] },
        1,
      ),
      /Only administrators/,
    );
    const draft = await saveContent(
      admin,
      { ...original, updateTeams: ["org", "org"] },
      1,
    );
    assert.deepEqual(draft.updateTeams, ["org"]);
    assert.equal(row.published!.updateTeams, undefined);
    await saveContent(admin, draft, 2, true);
    assert.deepEqual(row.published!.updateTeams, ["org"]);
    assert.equal(redact(row.published!).updateTeams, undefined);
    await assert.rejects(
      saveContent(admin, { ...original, kind: "doc", updateTeams: ["org"] }, 3),
      /only to Updates/,
    );
  } finally {
    Object.assign(store, old);
  }
});
