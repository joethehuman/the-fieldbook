import test from "node:test";
import assert from "node:assert/strict";
import { saveSettings } from "../../server/save-settings";
import { defaultSettings, defaultPrivacy } from "../../lib/settings";
import {
  canonicalBody,
  importMarkdownDocument,
} from "../../lib/block-document";
import type { User } from "../../lib/types";

const admin: User = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Admin",
  email: "admin@example.test",
  active: true,
  role: "admin",
  groups: [],
};
test("privacy settings preserve native documents, reject conflicting Markdown and enforce generated size limits", async () => {
  const previousFetch = globalThis.fetch,
    previousEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
    SUPABASE_SECRET_KEY: "synthetic",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
  });
  delete process.env.VERCEL_ENV;
  delete process.env.FIELDBOOK_ENVIRONMENT;
  const draft = canonicalBody({
    ...defaultPrivacy.draft,
    body: "",
    bodyDocument: importMarkdownDocument("Retain this policy."),
  });
  const settings = {
    ...defaultSettings,
    organizationTeamId: "organization",
    privacy: { ...defaultPrivacy, draft },
  };
  let writes = 0;
  globalThis.fetch = async (input, init) => {
    assert.ok(new URL(String(input)).pathname.endsWith("fb_config"));
    if (init?.method === "PATCH") {
      writes++;
      return Response.json({ revision: 8 });
    }
    return Response.json({
      settings,
      teams: [
        { id: "organization", name: "Organization", system: "organization" },
      ],
      groups: [],
      governance_revision: 11,
    });
  };
  try {
    const { bodyDocument: ignored, ...legacy } = draft;
    const result = await saveSettings(admin, {
      settings: {
        ...settings,
        name: "Renamed installation",
        privacy: { ...settings.privacy, draft: legacy },
      },
      expected: 7,
    });
    assert.deepEqual(
      result.settings.privacy!.draft.bodyDocument,
      draft.bodyDocument,
    );
    assert.equal(writes, 1);
    await assert.rejects(
      saveSettings(admin, {
        settings: {
          ...settings,
          privacy: {
            ...settings.privacy,
            draft: { ...legacy, body: "Discard blocks." },
          },
        },
        expected: 7,
      }),
      (error: any) => error.status === 400 && /uses blocks/.test(error.message),
    );
    const oversized = importMarkdownDocument("a".repeat(100001));
    await assert.rejects(
      saveSettings(admin, {
        settings: {
          ...settings,
          privacy: {
            ...settings.privacy,
            draft: {
              ...draft,
              body: "short projection",
              bodyDocument: oversized,
            },
          },
        },
        expected: 7,
      }),
      (error: any) => error.status === 400 && /size limit/.test(error.message),
    );
    assert.equal(writes, 1);
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnv;
  }
});
