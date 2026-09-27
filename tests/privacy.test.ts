import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultSettings,
  defaultPrivacy,
  publicSettings,
  privacyHref,
} from "../lib/settings";
import { settingsSchema } from "../production/lib/schemas";
test("retired taglines remain accepted in saved settings but are not public", () => {
  const legacy = { ...defaultSettings, tagline: "Previously saved" };
  assert.equal(settingsSchema.parse(legacy).tagline, "Previously saved");
  assert.equal("tagline" in publicSettings(legacy), false);
  assert.equal("tagline" in defaultSettings, false);
});
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

test("hosted policies accept email, contact page or both without requiring a personal email", () => {
  const policy = {
    ...defaultPrivacy.draft,
    body: "Policy",
    operatorName: "Example",
  };
  const parse = (contact: object) =>
    settingsSchema.safeParse({
      ...defaultSettings,
      privacy: { ...defaultPrivacy, published: { ...policy, ...contact } },
    }).success;
  assert.equal(parse({}), false);
  assert.equal(parse({ contactUrl: "https://example.com/contact" }), true);
  assert.equal(parse({ contactEmail: "support@example.com" }), true);
  assert.equal(
    parse({
      contactEmail: "support@example.com",
      contactUrl: "https://example.com/contact",
    }),
    true,
  );
  for (const contactUrl of [
    "javascript:alert(1)",
    "http://example.com",
    "//example.com",
  ])
    assert.equal(parse({ contactUrl }), false);
  assert.equal(
    parse({
      contactEmail: "invalid",
      contactUrl: "https://example.com/contact",
    }),
    false,
  );
});
