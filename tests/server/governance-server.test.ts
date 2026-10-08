import { test } from "node:test";
import assert from "node:assert/strict";
import { adminSnapshot } from "../../server/admin-snapshot";
import { data as dataStore } from "../../server/data";
import { defaultSettings } from "../../lib/settings";
import type { User } from "../../lib/types";
import { env, siteOrigins } from "../../server/env";
import { sameOrigin } from "../../server/auth";

test("Admin governance reads reject stale, inactive or removed authoritative accounts", async () => {
  const store = dataStore();
  const previous = { ...store };
  const user: User = {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Admin",
    email: "admin@example.test",
    role: "admin",
    active: true,
    groups: [],
  };
  let current: User | null = user;
  Object.assign(store, {
    readConfiguration: async () => ({
      settings: defaultSettings,
      groups: [],
      teams: [],
      curricula: [],
      revision: 1,
      governance_revision: 1,
    }),
    listDraftIndex: async () => [],
    listDraftCourses: async () => [],
    listPublishedAssignmentContent: async () => [],
    readGovernanceSnapshot: async () => ({
      users: current ? [current] : [],
      groups: [],
      teams: [],
      progress: [],
      pending: [],
      revision: 1,
    }),
  });
  try {
    const state = await adminSnapshot(user, "governance");
    assert.deepEqual(
      state.users.map((person) => person.id),
      [user.id],
    );
    assert.equal(state.governanceRevision, 1);
    for (const changed of [
      { ...user, role: "learner" as const },
      { ...user, role: "manager" as const },
      { ...user, active: false },
      null,
    ]) {
      current = changed;
      await assert.rejects(
        adminSnapshot(user, "governance"),
        /Account access changed/,
      );
    }
  } finally {
    Object.assign(store, previous);
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
      new Request(
        "https://fieldbook-unique-deployment.vercel.app/api/progress",
        {
          method: "POST",
          headers: origin ? { Origin: origin } : {},
        },
      );
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
  const parsed = governanceSchema.parse({
    expected: 1,
    groups: [],
    users: [],
    teams: [
      {
        id: "root",
        name: "Organization",
        system: "organization",
        learningItems: [
          { kind: "course", id: "00000000-0000-4000-8000-000000000010" },
        ],
      },
    ],
  });
  assert.equal(parsed.teams[0].system, "organization");
  assert.equal(parsed.teams[0].learningItems?.length, 1);
});
