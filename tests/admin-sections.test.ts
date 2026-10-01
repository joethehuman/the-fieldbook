import test from "node:test";
import assert from "node:assert/strict";
import { createAdminRuntime } from "../lib/admin-runtime";
import { freshWorkspace } from "../lib/store";
test("Admin starts without section fetches; requested data is coalesced and reused", async () => {
  const data = freshWorkspace(),
    user = data.users.find((user) => user.role === "admin")!;
  const before = globalThis.fetch;
  const reads: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.fetch = async (input) => {
    reads.push(String(input));
    await held;
    return new Response(JSON.stringify({ data, user }), {
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const runtime = createAdminRuntime({ data, user });
    await Promise.resolve();
    assert.deepEqual(reads, []);
    assert.equal(await runtime.admin.prepare("content"), data);
    const first = runtime.admin.prepare("feedback"),
      second = runtime.admin.prepare("feedback");
    assert.deepEqual(reads, ["/api/admin/snapshot?scope=feedback"]);
    release();
    await Promise.all([first, second]);
    await runtime.admin.prepare("feedback");
    assert.equal(reads.length, 1);
    await runtime.admin.prepare("deleted");
    assert.equal(reads[1], "/api/admin/snapshot?scope=deleted");
  } finally {
    globalThis.fetch = before;
  }
});
