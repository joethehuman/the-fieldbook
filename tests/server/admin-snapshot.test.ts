import test from "node:test";
import assert from "node:assert/strict";
import { adminSnapshot } from "../../server/admin-snapshot";
import { defaultSettings } from "../../lib/settings";
const admin = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "Admin",
  email: "admin@example.test",
  role: "admin" as const,
  active: true,
  groups: [],
};

test("Content reads only its projected index/config; unrelated sections read on demand", async () => {
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: admin.email,
  });
  let reads: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    reads.push(url);
    const table = url.pathname.split("/").pop();
    const body =
      table === "fb_config"
        ? {
            settings: defaultSettings,
            groups: [],
            curricula: [],
            revision: 1,
            governance_revision: 1,
          }
        : table === "fb_cleanup_config"
          ? { endpoint: "https://example.test/cleanup", last_run: null }
          : table === "fb_governance_snapshot"
            ? {
                users: [admin],
                groups: [],
                teams: [],
                pending: [],
                progress: [],
                revision: 1,
              }
            : [];
    return new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json",
        ...(Array.isArray(body) ? { "Content-Range": "*/0" } : {}),
      },
    });
  };
  try {
    const content = await adminSnapshot(admin, "content");
    assert.deepEqual(reads.map((url) => url.pathname.split("/").pop()).sort(), [
      "fb_config",
      "fb_documents",
    ]);
    assert.equal(content.deletedItems, undefined);
    assert.equal(content.cleanupStatus, undefined);
    assert.deepEqual(content.users, [admin]);
    assert.deepEqual(content.feedback, []);
    assert.deepEqual(content.progress, {});
    assert.ok(
      !reads
        .find((url) => url.pathname.endsWith("fb_documents"))!
        .searchParams.get("select")!
        .split(",")
        .includes("draft"),
    );
    reads = [];
    await adminSnapshot(admin, "feedback");
    assert.ok(reads.some((url) => url.pathname.endsWith("fb_feedback")));
    assert.ok(
      !reads.some((url) =>
        /fb_deleted_items|fb_cleanup_config|fb_governance_snapshot/.test(
          url.pathname,
        ),
      ),
    );
    reads = [];
    const deleted = await adminSnapshot(admin, "deleted");
    assert.ok(reads.some((url) => url.pathname.endsWith("fb_deleted_items")));
    assert.ok(deleted.cleanupStatus?.configured);
    assert.ok(
      !reads.some((url) =>
        /fb_feedback|fb_governance_snapshot/.test(url.pathname),
      ),
    );
    reads = [];
    await adminSnapshot(admin, "governance");
    const queries = reads.filter((url) =>
      url.pathname.endsWith("fb_documents"),
    );
    assert.equal(queries.length, 2);
    assert.ok(
      queries.some(
        (url) => url.searchParams.get("draft->>kind") === "neq.course",
      ),
    );
    assert.ok(
      queries.some(
        (url) => url.searchParams.get("draft->>kind") === "eq.course",
      ),
    );
    assert.ok(
      !reads.some((url) =>
        /fb_feedback|fb_deleted_items|fb_cleanup_config/.test(url.pathname),
      ),
    );
    reads = [];
    await assert.rejects(
      () => adminSnapshot({ ...admin, role: "manager" }, "deleted"),
      /Administrator access/,
    );
    assert.equal(reads.length, 0);
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
});
