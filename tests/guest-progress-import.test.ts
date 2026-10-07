import test from "node:test";
import assert from "node:assert/strict";
import { restoreGuestProgress } from "../lib/guest-progress-import";
import { RequestError } from "../lib/workspace-save";

const key = "fieldbook.guest-progress.v1";
const record = (id: string) => ({
  content_id: id,
  version: 1,
  lessons: ["first"],
  passed: false,
});
function browser(records: unknown) {
  const values = new Map<string, string>([[key, JSON.stringify(records)]]);
  return {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => {
      values.set(name, value);
    },
    removeItem: (name: string) => {
      values.delete(name);
    },
  };
}

test("incompatible records do not block valid progress and processed records do not return", async () => {
  const storage = browser([
    null,
    record("invalid"),
    record("missing"),
    record("old"),
    record("valid"),
  ]);
  const calls: unknown[] = [];
  const send = async (body: any) => {
    calls.push(body);
    const status = { invalid: 400, missing: 404, old: 409 }[
      body.contentId as string
    ];
    if (status) throw new RequestError("Incompatible", status);
  };
  assert.equal(await restoreGuestProgress(storage, send), 1);
  assert.equal(storage.getItem(key), null);
  assert.equal(await restoreGuestProgress(storage, send), 0);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.at(-1), {
    contentId: "valid",
    version: 1,
    lessons: ["first"],
    complete: false,
    answers: undefined,
    selections: undefined,
    guestImport: true,
  });
});

test("auth, rate limit, server and network failures preserve unconfirmed progress for a later attempt", async () => {
  for (const error of [
    new RequestError("Session expired", 401),
    new RequestError("Unavailable account", 403),
    new RequestError("Rate limited", 429),
    new RequestError("Unavailable", 503),
    new TypeError("Offline"),
  ]) {
    const pending = [record("retry"), record("later")];
    const storage = browser([record("saved"), ...pending]);
    const calls: string[] = [];
    assert.equal(
      await restoreGuestProgress(storage, async (body: any) => {
        calls.push(body.contentId);
        if (body.contentId === "retry") throw error;
      }),
      1,
    );
    assert.deepEqual(JSON.parse(storage.getItem(key)!), pending);
    assert.deepEqual(calls, ["saved", "retry"]);
    assert.equal(await restoreGuestProgress(storage, async () => {}), 2);
    assert.equal(storage.getItem(key), null);
  }
});

test("storage failures and corrupt browser data never escape into the reader", async () => {
  let calls = 0;
  const send = async () => {
    calls++;
  };
  const denied = () => {
    throw new Error("Storage denied");
  };
  assert.equal(
    await restoreGuestProgress(
      { getItem: denied, setItem: denied, removeItem: denied },
      send,
    ),
    0,
  );
  for (const raw of ["broken JSON", "{}", "null"]) {
    const storage = browser([]);
    storage.setItem(key, raw);
    assert.equal(await restoreGuestProgress(storage, send), 0);
    assert.equal(storage.getItem(key), null);
  }
  assert.equal(calls, 0);
  const storage = browser([record("saved")]);
  storage.removeItem = denied;
  assert.equal(await restoreGuestProgress(storage, send), 1);
  assert.ok(storage.getItem(key));
});

test("progress written during restoration survives cleanup", async () => {
  const original = record("valid");
  const updated = { ...original, lessons: ["first", "second"] };
  const storage = browser([original]);
  assert.equal(
    await restoreGuestProgress(storage, async () => {
      storage.setItem(key, JSON.stringify([updated, record("new")]));
    }),
    1,
  );
  assert.deepEqual(JSON.parse(storage.getItem(key)!), [updated, record("new")]);
});
