import test from "node:test";
import assert from "node:assert/strict";
import { adminSnapshot } from "../../server/admin-snapshot";
import { requirePublisher } from "../../server/auth";
import { bulkAction } from "../../server/bulk-actions";
import { defaultSettings } from "../../lib/settings";
import type { User } from "../../lib/types";
const user: User = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Publisher",
  email: "publisher@example.test",
  role: "contributor",
  active: true,
  groups: [],
};

test("contributor scopes deny protected requests before reads and project only publishing data", async () => {
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://contributor-contract.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "owner@example.test",
    FIELDBOOK_HOST: "node",
  });
  const queries: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    queries.push(url);
    const headers = { "Content-Range": "0-0/1" };
    if (url.pathname.endsWith("fb_config"))
      return Response.json({
        revision: 5,
        governance_revision: 12,
        settings: {
          ...defaultSettings,
          docSections: [{ id: "empty", name: "Empty section" }],
          privacy: { draft: { body: "PRIVATE DRAFT" } },
        },
        groups: [
          {
            id: "g",
            name: "Relevance",
            teamIds: ["PRIVATE TEAM"],
            requiredCourseIds: ["PRIVATE ASSIGNMENT"],
          },
        ],
        curricula: [{ id: "PRIVATE CURRICULUM" }],
      });
    if (url.pathname.endsWith("fb_documents"))
      return Response.json([], { headers: { "Content-Range": "*/0" } });
    if (url.pathname.endsWith("fb_feedback"))
      return Response.json(
        [
          {
            id: "feedback",
            user_id: "respondent",
            content_id: null,
            rating: "up",
            comment: "General feedback",
            updated_at: "2026-10-01",
          },
        ],
        { headers },
      );
    if (url.pathname.endsWith("fb_profiles")) {
      assert.equal(url.searchParams.get("select"), "id,name");
      return Response.json([{ id: "respondent", name: "Respondent" }]);
    }
    if (url.pathname.endsWith("fb_deleted_items")) {
      assert.equal(url.searchParams.get("entity"), "eq.content");
      return Response.json([], { headers: { "Content-Range": "*/0" } });
    }
    throw new Error("Unexpected privileged read: " + url.pathname);
  };
  try {
    requirePublisher(user);
    assert.throws(
      () => requirePublisher({ ...user, registered: false }),
      /publishing access/,
    );
    for (const scope of ["people", "person", "governance"] as const)
      await assert.rejects(adminSnapshot(user, scope), /Administrator/);
    for (const operation of ["delete", "restore"] as const)
      await assert.rejects(
        bulkAction(user, {
          entity: "user",
          operation,
          items: [{ id: user.id, expected: 1 }],
        }),
        /Administrator/,
      );
    assert.equal(queries.length, 0);
    const content = await adminSnapshot(user, "content");
    assert.deepEqual(content.groups, [{ id: "g", name: "Relevance" }]);
    assert.deepEqual(content.curricula, []);
    assert.deepEqual(content.teams, []);
    assert.equal(content.governanceRevision, undefined);
    assert.equal(content.settings?.privacy?.draft.body, "");
    assert.equal(content.settings?.docSections?.[0].id, "empty");
    const feedback = await adminSnapshot(user, "feedback");
    assert.equal(feedback.feedback![0].comment, "General feedback");
    assert.equal(feedback.users.find((p) => p.id === "respondent")?.email, "");
    assert.deepEqual(feedback.progress, {});
    const maintenance = await adminSnapshot(user, "maintenance");
    assert.deepEqual(maintenance.deletedItems, []);
    assert.equal(maintenance.cleanupStatus, undefined);
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
});

test("feedback respondent names use bounded minimal reads without truncating larger installations", async () => {
  const { data } = await import("../../server/data");
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://contributor-contract.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "owner@example.test",
    FIELDBOOK_HOST: "node",
  });
  const ids = Array.from(
    { length: 1201 },
    (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  );
  let calls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls++;
    assert.equal(url.pathname, "/rest/v1/fb_profiles");
    assert.equal(url.searchParams.get("select"), "id,name");
    const chunk = url.searchParams.get("id")!.slice(4, -1).split(",");
    assert.ok(chunk.length <= 100);
    return Response.json(chunk.map((id) => ({ id, name: "Respondent " + id })));
  };
  try {
    const names = await data().readProfileNames([...ids, ids[0]]);
    assert.equal(names.length, 1201);
    assert.equal(calls, 13);
    assert.deepEqual(names.map((p) => p.id).sort(), [...ids].sort());
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
});
