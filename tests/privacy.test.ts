import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultSettings,
  defaultPrivacy,
  publicSettings,
  privacyHref,
} from "../lib/settings";
import { settingsSchema } from "../production/lib/schemas";
test("policy drafts never appear in public settings and published copy is retained", () => {
  const settings = {
    ...defaultSettings,
    privacy: {
      ...defaultPrivacy,
      draft: { ...defaultPrivacy.draft, body: "PRIVATE DRAFT" },
      published: {
        ...defaultPrivacy.draft,
        body: "Published policy",
        operatorName: "Example",
        contactEmail: "privacy@example.com",
      },
      publishedAt: "2026-09-19T00:00:00.000Z",
    },
  };
  assert.equal(
    JSON.stringify(publicSettings(settings)).includes("PRIVATE DRAFT"),
    false,
  );
  assert.equal(
    publicSettings(settings).privacy?.published?.body,
    "Published policy",
  );
  assert.equal(settings.privacy.draft.body, "PRIVATE DRAFT");
  assert.equal(privacyHref(settings), "/privacy");
});
test("policy publication requires a complete hosted policy or safe external URL", () => {
  const withPolicy = (published: unknown) => ({
    ...defaultSettings,
    privacy: { ...defaultPrivacy, published },
  });
  assert.equal(settingsSchema.safeParse(defaultSettings).success, true);
  assert.equal(
    settingsSchema.safeParse(withPolicy(defaultPrivacy.draft)).success,
    false,
  );
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "//example.com",
  ])
    assert.equal(
      settingsSchema.safeParse(
        withPolicy({ ...defaultPrivacy.draft, mode: "external", url }),
      ).success,
      false,
    );
  assert.equal(
    settingsSchema.safeParse(
      withPolicy({
        ...defaultPrivacy.draft,
        mode: "external",
        url: "https://example.com/privacy",
      }),
    ).success,
    true,
  );
  assert.equal(privacyHref(defaultSettings), null);
});
