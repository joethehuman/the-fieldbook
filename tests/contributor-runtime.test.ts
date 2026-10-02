import test from "node:test";
import assert from "node:assert/strict";
import { createAdminRuntime } from "../lib/admin-runtime";
import { freshWorkspace } from "../lib/store";

test("contributor runtime prefetches feedback only and rejects protected sections and role revocation", async () => {
  const data = freshWorkspace(), user = data.users.find((u) => u.role === "contributor")!;
  const oldFetch = globalThis.fetch, paths: string[] = [];
  let revoked = false;
  globalThis.fetch = async (input) => {
    paths.push(String(input));
    return Response.json({ user: revoked ? { ...user, role: "manager" } : user, data });
  };
  try {
    const runtime = createAdminRuntime({ user, data });
    runtime.admin.prefetch();
    await runtime.admin.prepare("feedback");
    assert.deepEqual(paths, ["/api/admin/snapshot?scope=feedback"]);
    await assert.rejects(runtime.admin.prepare("people"), /Administrator/);
    assert.equal(paths.length, 1);
    revoked = true;
    await assert.rejects(runtime.admin.prepare("maintenance"), /Publishing access changed/);
  } finally { globalThis.fetch = oldFetch; }
});
