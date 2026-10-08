import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import { createSettingsSaver } from "../lib/settings-save";
import { RequestError } from "../lib/workspace-save";

function fixture() {
  const before = freshWorkspace();
  before.revision = 3;
  const settings = { ...before.settings!, name: "Saved installation" };
  return { before, settings };
}

test("atomic settings save uses fresh revision and acknowledged canonical settings even if the follow-up read fails", async () => {
  const { before, settings } = fixture();
  let reads = 0;
  const canonical = { ...settings, name: "Canonical installation" };
  const save = createSettingsSaver(
    async (path, body) => {
      assert.equal(path, "/api/settings");
      assert.deepEqual(body, { settings, expected: 7 });
      return { revision: 8, settings: canonical };
    },
    async () => {
      if (++reads > 1) throw new Error("read unavailable");
      return { ...before, revision: 7 };
    },
  );
  const saved = await save(before, settings);
  assert.equal(saved.revision, 8);
  assert.deepEqual(saved.settings, canonical);
});

test("failed settings save preserves the draft and another explicit Save retries without a recovery step", async () => {
  const { before, settings } = fixture();
  let writes = 0;
  let current = before;
  const save = createSettingsSaver(
    async () => {
      if (++writes === 1)
        throw new RequestError("Database temporarily unavailable", 503);
      current = { ...before, settings, revision: 4 };
      return { revision: 4, settings };
    },
    async () => current,
  );
  await assert.rejects(
    save(before, settings),
    /Database temporarily unavailable/,
  );
  assert.equal(settings.name, "Saved installation");
  assert.deepEqual((await save(before, settings)).settings, settings);
  assert.equal(writes, 2);
});

test("a lost settings response is confirmed by reading and never resent", async () => {
  const { before, settings } = fixture();
  let writes = 0;
  let current = before;
  const save = createSettingsSaver(
    async () => {
      writes++;
      current = { ...before, settings, revision: 4 };
      throw new TypeError("private transport details");
    },
    async () => current,
  );
  assert.deepEqual((await save(before, settings)).settings, settings);
  await save(before, settings);
  assert.equal(writes, 1);
});

test("unavailable recovery read keeps edits and the next explicit Save reads before deciding to write", async () => {
  const { before, settings } = fixture();
  let writes = 0,
    reads = 0;
  const saved = { ...before, settings, revision: 4 };
  const save = createSettingsSaver(
    async () => {
      writes++;
      throw new TypeError("private transport details");
    },
    async () => {
      if (++reads === 1) return before;
      if (reads === 2) throw new Error("read unavailable");
      return saved;
    },
  );
  await assert.rejects(save(before, settings), (error: Error) => {
    assert.match(error.message, /settings couldn’t be saved/);
    assert.doesNotMatch(error.message, /private transport details/);
    return true;
  });
  assert.equal((await save(before, settings)).revision, 4);
  assert.equal(writes, 1);
});

test("settings changed by another administrator cannot be overwritten on retry", async () => {
  const { before, settings } = fixture();
  let writes = 0;
  let current = before;
  const save = createSettingsSaver(
    async () => {
      writes++;
      current = {
        ...before,
        revision: 4,
        settings: { ...before.settings!, name: "Other administrator" },
      };
      throw new RequestError("Settings changed. Reload before saving.", 409);
    },
    async () => current,
  );
  await assert.rejects(save(before, settings), /Settings changed/);
  await assert.rejects(save(before, settings), /changed in another session/);
  assert.equal(writes, 1);
  assert.equal(current.settings!.name, "Other administrator");
});

test("a failed pre-save read performs no mutation", async () => {
  const { before, settings } = fixture();
  let writes = 0;
  const save = createSettingsSaver(
    async () => {
      writes++;
    },
    async () => {
      throw new RequestError("Settings are unavailable", 503);
    },
  );
  await assert.rejects(save(before, settings), /Settings are unavailable/);
  assert.equal(writes, 0);
});
