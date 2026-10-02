import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshot } from "../../server/snapshot";
import { env, siteOrigins } from "../../server/env";
import { sameOrigin } from "../../server/auth";

test("workspace serialization preserves public catalog but scopes assignments, drafts, people and progress", async () => {
  const savedFetch = globalThis.fetch,
    savedEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://preview.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://preview.example",
    FIELDBOOK_OWNER_EMAIL: "owner@example.test",
  });
  const user: any = {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Manager",
    email: "manager@example.test",
    role: "manager",
    active: true,
    groups: [],
  };
  const course = {
    id: "course",
    kind: "course",
    status: "published",
    title: "Public",
    groups: ["sales", "other"],
    assignments: [
      {
        groupId: "sales",
        assignedAt: "2026-09-01T00:00:00Z",
        due: { type: "none" },
      },
      {
        groupId: "other",
        assignedAt: "2026-09-01T00:00:00Z",
        due: { type: "none" },
      },
      {
        userId: user.id,
        assignedAt: "2026-09-01T00:00:00Z",
        due: { type: "none" },
      },
      {
        userId: "00000000-0000-4000-8000-000000000099",
        assignedAt: "2026-09-01T00:00:00Z",
        due: { type: "none" },
      },
    ],
    questions: [{ id: "q", answer: 1, options: ["a", "b"] }],
  };
  const row = {
    id: "course",
    updated_at: "2026-09-01T00:00:00Z",
    revision: 2,
    draft: { ...course, title: "Private draft" },
    published: course,
  };
  let govRole = "manager";
  globalThis.fetch = async (input) => {
    const url = String(input);
    let body: any;
    if (url.includes("fb_config"))
      body = {
        settings: { access: "public", registration: "open" },
        revision: 1,
        groups: [],
        teams: [],
        curricula: [
          {
            id: "published",
            name: "Playlist",
            status: "published",
            courseIds: ["course", "draft"],
          },
          { id: "draft-playlist", status: "draft", courseIds: ["draft"] },
        ],
      };
    else if (url.includes("fb_documents"))
      body = [row, { ...row, id: "draft", published: null }];
    else if (url.includes("fb_governance_snapshot"))
      body = {
        users: [{ ...user, role: govRole, group_joined_at: {} }],
        groups: [{ id: "sales", name: "Sales" }],
        teams: [],
        progress: [
          {
            user_id: user.id,
            content_id: "course",
            version: 1,
            lessons: [],
            passed: false,
          },
        ],
        pending: [],
        revision: 1,
      };
    else if (url.includes("fb_feedback")) {
      assert.ok(url.includes("user_id=eq."));
      body = [];
    } else throw new Error(`Unexpected request ${url}`);
    return new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json",
        ...(Array.isArray(body)
          ? { "Content-Range": `0-${body.length - 1}/${body.length}` }
          : {}),
      },
    });
  };
  try {
    const state = await snapshot(user);
    assert.equal(state.content.length, 1);
    assert.equal(state.content[0].title, "Public");
    assert.equal(state.content[0].questions[0].answer, undefined);
    assert.deepEqual(state.content[0].groups, ["sales"]);
    assert.deepEqual(
      state.content[0].assignments?.map((a) => a.groupId),
      ["sales", undefined],
    );
    assert.deepEqual(Object.keys(state.progress), [user.id]);
    const guest = await snapshot(null);
    assert.equal(guest.content.length, 1);
    assert.deepEqual(guest.content[0].groups, []);
    assert.deepEqual(guest.groups, []);
    assert.deepEqual(
      guest.curricula?.map((c) => ({ id: c.id, courseIds: c.courseIds })),
      [{ id: "published", courseIds: ["course"] }],
    );
    // A stale actor role cannot upgrade the authoritative database-scoped response.
    govRole = "learner";
    const changed = await snapshot({ ...user, role: "admin" });
    assert.equal(changed.content[0].title, "Public");
    assert.equal(changed.governanceRevision, undefined);
  } finally {
    globalThis.fetch = savedFetch;
    process.env = savedEnv;
  }
});

test("preview configuration fails closed if backend identity is missing or different", () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: "https://isolated.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "key",
      SUPABASE_SECRET_KEY: "secret",
      FIELDBOOK_URL: "https://preview.example",
      FIELDBOOK_OWNER_EMAIL: "owner@example.test",
      VERCEL_ENV: "preview",
    });
    delete process.env.FIELDBOOK_PREVIEW_SUPABASE_REF;
    assert.throws(env, /isolated/);
    process.env.FIELDBOOK_PREVIEW_SUPABASE_REF = "different";
    assert.throws(env, /isolated/);
    process.env.FIELDBOOK_PREVIEW_SUPABASE_REF = "isolated";
    assert.equal(env().url, "https://isolated.supabase.co");
    process.env.VERCEL_BRANCH_URL = "fieldbook-git-feature-two.vercel.app";
    assert.equal(env().origin, "https://fieldbook-git-feature-two.vercel.app");
    process.env.VERCEL_URL = "fieldbook-unique-deployment.vercel.app";
    assert.deepEqual(siteOrigins(), [
      "https://fieldbook-git-feature-two.vercel.app",
      "https://fieldbook-unique-deployment.vercel.app",
    ]);
    const requestFrom = (origin?: string) =>
      new Request("https://fieldbook-unique-deployment.vercel.app/api/progress", {
        method: "POST",
        headers: origin ? { Origin: origin } : {},
      });
    assert.doesNotThrow(() =>
      sameOrigin(requestFrom("https://fieldbook-unique-deployment.vercel.app")),
    );
    assert.doesNotThrow(() =>
      sameOrigin(requestFrom("https://fieldbook-git-feature-two.vercel.app")),
    );
    assert.throws(() => sameOrigin(requestFrom("https://other.vercel.app")));
    assert.throws(() => sameOrigin(requestFrom()));
    process.env.VERCEL_ENV = "production";
    assert.equal(env().origin, "https://preview.example");
    assert.deepEqual(siteOrigins(), ["https://preview.example"]);
    assert.throws(() =>
      sameOrigin(requestFrom("https://fieldbook-unique-deployment.vercel.app")),
    );
  } finally {
    process.env = saved;
  }
});

test("governance retains an installed system Organization marker while adding learning", async () => {
  const { governanceSchema } = await import("../../server/governance-schema");
  const parsed = governanceSchema.parse({expected: 1, groups: [], users: [], teams: [{id: "root", name: "Organization", system: "organization", learningItems: [{kind: "course", id: "00000000-0000-4000-8000-000000000010"}]}]});
  assert.equal(parsed.teams[0].system, "organization");
  assert.equal(parsed.teams[0].learningItems?.length, 1);
});
