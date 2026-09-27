import test from "node:test";
import assert from "node:assert/strict";
import { bulkAction } from "../lib/bulk-actions";
import { purgeDeleted } from "../lib/deletion-worker";
import { seedContent } from "../../lib/seed";
const admin = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Admin",
  email: "admin@example.test",
  role: "admin" as const,
  active: true,
  groups: [],
};
const id = "00000000-0000-4000-8000-000000000002";
async function fixture(
  handler: (url: URL, method: string, body: any) => unknown,
  run: () => Promise<void>,
) {
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: admin.email,
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "test.supabase.co");
    const body = handler(
      url,
      init?.method || "GET",
      init?.body ? JSON.parse(String(init.body)) : undefined,
    );
    return new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json",
        ...(Array.isArray(body)
          ? {
              "Content-Range": `0-${Math.max(0, body.length - 1)}/${body.length}`,
            }
          : {}),
      },
    });
  };
  try {
    await run();
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
}
test("bulk authorization happens before database access", async () => {
  await fixture(
    () => {
      throw new Error("Unexpected database access");
    },
    async () => {
      const request = {
        entity: "content",
        operation: "delete",
        items: [{ id, expected: 1 }],
      };
      await assert.rejects(bulkAction(null, request), /Sign in/);
      await assert.rejects(
        bulkAction({ ...admin, role: "learner" }, request),
        /Administrator/,
      );
      await assert.rejects(
        bulkAction({ ...admin, active: false }, request),
        /Administrator/,
      );
    },
  );
});
test("bulk publication loads authoritative bodies and never invents a course version", async () => {
  const content = {
    ...seedContent.find((c) => c.kind === "brief")!,
    id,
    groups: [],
    assignments: [],
    body: "Full saved body",
    status: "draft" as const,
    version: 4,
  };
  let saved = false;
  await fixture(
    (url, method, body) => {
      if (url.pathname.endsWith("fb_documents"))
        return {
          id,
          revision: 5,
          draft: content,
          published: { ...content, body: "Older published body" },
          published_revision: 4,
        };
      if (url.pathname.endsWith("fb_save_document")) {
        assert.equal(body.p_draft.body, "Full saved body");
        assert.equal(body.p_draft.version, 4);
        assert.equal(body.p_expected, 5);
        assert.equal(body.p_publish, true);
        saved = true;
        return {
          id,
          revision: 6,
          draft: body.p_draft,
          published: body.p_draft,
          published_revision: 6,
        };
      }
      throw new Error(`Unexpected ${method} ${url.pathname}`);
    },
    async () => {
      const result = await bulkAction(admin, {
        entity: "content",
        operation: "publish",
        items: [{ id, expected: 5 }],
      });
      assert.equal(result[0].status, "changed");
      assert(saved);
      const stale = await bulkAction(admin, {
        entity: "content",
        operation: "publish",
        items: [{ id, expected: 1 }],
      });
      assert.equal(stale[0].status, "failed");
    },
  );
});
test("worker authenticates, retries an Auth lock without early deletion, and deletes expired Auth users through the API", async () => {
  const calls: string[] = [];
  const expired = "00000000-0000-4000-8000-000000000003";
  await fixture(
    (url, method, body) => {
      calls.push(`${method} ${url.pathname}`);
      if (url.pathname.endsWith("fb_claim_deletions")) {
        assert.equal(body.p_secret.length, 64);
        return [
          { entity: "user", id, purging: false, claim: id },
          { entity: "user", id: expired, purging: true, claim: expired },
        ];
      }
      if (url.pathname === `/auth/v1/admin/users/${id}`) {
        assert.equal(method, "PUT");
        assert.equal(body.ban_duration, "876600h");
        return { user: { id } };
      }
      if (url.pathname === `/auth/v1/admin/users/${expired}`) {
        assert.equal(method, "DELETE");
        return { user: { id: expired } };
      }
      if (url.pathname.endsWith("fb_deleted_items")) {
        assert.equal(body.auth_locked, true);
        return null;
      }
      if (url.pathname.endsWith("fb_finish_deletion")) {
        assert.equal(body.p_id, expired);
        return null;
      }
      if (url.pathname.endsWith("fb_collect_deleted_media")) return [];
      throw new Error(`Unexpected ${method} ${url.pathname}`);
    },
    async () => {
      await assert.rejects(purgeDeleted("invalid"), /credential/);
      assert.equal(calls.length, 0);
      assert.deepEqual(await purgeDeleted("a".repeat(64)), {
        removed: 1,
        failed: 0,
      });
      assert(!calls.includes(`DELETE /auth/v1/admin/users/${id}`));
    },
  );
});
