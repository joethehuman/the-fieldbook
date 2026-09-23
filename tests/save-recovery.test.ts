import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import {
  createWorkspaceSaver,
  request,
  RequestError,
} from "../lib/workspace-save";
import { SaveRecoveryError } from "../lib/save-recovery";

function fixture() {
  const before = freshWorkspace(),
    after = structuredClone(before);
  after.content[0].title = "Edited locally";
  return { before, after };
}
test("confirmed save followed by failed refresh does not repeat the write", async () => {
  const { before, after } = fixture();
  let writes = 0,
    unavailable = true;
  const save = createWorkspaceSaver(
    async () => {
      writes++;
    },
    async () => {
      if (unavailable) throw new Error("offline");
      return after;
    },
  );
  await assert.rejects(save(before, after), /Changes saved, but/);
  await assert.rejects(save(before, after), /still unavailable/);
  unavailable = false;
  await assert.rejects(save(before, after), (e: SaveRecoveryError) => {
    assert.equal(e.snapshot, after);
    assert.match(e.message, /no changes were resent/);
    return true;
  });
  assert.equal(writes, 1);
});
test("partial failure stops subsequent writes and returns fresh revisions", async () => {
  const { before, after } = fixture();
  after.content[1].title = "Second edit";
  after.content[2].title = "Third edit";
  const current = structuredClone(before);
  current.content[0] = { ...after.content[0], revision: 2 };
  let writes = 0;
  const save = createWorkspaceSaver(
    async () => {
      if (++writes === 2) throw new RequestError("Revision conflict", 409);
    },
    async () => current,
  );
  await assert.rejects(save(before, after), (e: SaveRecoveryError) => {
    assert.equal(e.snapshot, current);
    assert.match(e.message, /1 of 3 changes confirmed saved/);
    assert.match(e.message, /rejected change was not saved/);
    return true;
  });
  assert.equal(writes, 2);
  assert.equal(after.content[1].title, "Second edit");
});
test("lost mutation response is uncertain even if the server saved it", async () => {
  const { before, after } = fixture();
  const save = createWorkspaceSaver(
    async () => {
      throw new TypeError("token secret");
    },
    async () => after,
  );
  await assert.rejects(save(before, after), (e: SaveRecoveryError) => {
    assert.match(e.message, /may have been saved/);
    assert.doesNotMatch(e.message, /token secret/);
    assert.equal(e.snapshot, after);
    return true;
  });
});
test("invalid multi-account plan is rejected before any mutation", async () => {
  const { before, after } = fixture();
  after.pendingUsers = ["a", "b"].map((name) => ({
    name,
    email: name + "@example.test",
    role: "learner",
    groups: [],
  }));
  let writes = 0;
  const save = createWorkspaceSaver(
    async () => {
      writes++;
    },
    async () => after,
  );
  await assert.rejects(save(before, after), /one pending account/);
  assert.equal(writes, 0);
});
test("simultaneous save is rejected instead of duplicating writes", async () => {
  const { before, after } = fixture();
  let release!: () => void;
  let writes = 0;
  const save = createWorkspaceSaver(
    async () => {
      writes++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    async () => after,
  );
  const first = save(before, after);
  await assert.rejects(save(before, after), /already in progress/);
  release();
  await first;
  assert.equal(writes, 1);
});
test("API request keeps safe correlation IDs for user recovery", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      {
        error: "Database unavailable",
        requestId: "00000000-0000-4000-8000-000000000010",
      },
      { status: 503 },
    );
  try {
    await assert.rejects(
      request("/api/content", {}),
      /Reference: 00000000-0000-4000-8000-000000000010/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("team member moves use one revision-checked governance write and keep other data", async () => {
  const before = freshWorkspace();
  before.governanceRevision = 7;
  const after = structuredClone(before);
  after.users[0].teamId = undefined;
  after.users[1].teamId = undefined;
  const writes: { path: string; body: unknown }[] = [];
  const save = createWorkspaceSaver(
    async (path, body) => {
      writes.push({ path, body });
      return {};
    },
    async () => after,
  );
  await save(before, after);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "/api/governance");
  assert.deepEqual(writes[0].body, {
    expected: 7,
    users: after.users,
    groups: before.groups,
    teams: before.teams,
    curricula: before.curricula,
  });
  assert.deepEqual(after.progress, before.progress);
});
