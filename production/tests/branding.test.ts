import test from "node:test";
import assert from "node:assert/strict";
import { publicBranding } from "../lib/branding";
import { readyLogo, signedBrandingLogoUrl } from "../lib/branding-logo";
import { brandingFromSettings } from "../../lib/branding";
import { settingsSchema } from "../lib/schemas";
import { defaultSettings, defaultPrivacy } from "../../lib/settings";
import { signInFailure } from "../lib/sign-in-failure";
import { HttpError, ServiceError } from "../lib/errors";
import { safeNext } from "../lib/redirect";
import { SIGN_IN_RETURN_COOKIE } from "../lib/sign-in";

const file = "00000000-0000-4000-8000-000000000001.png";
const reference = `/api/media/${file}`;
test("branding projection contains only public identity with existing-installation defaults", async () => {
  const previous = globalThis.fetch;
  const oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
    SUPABASE_SECRET_KEY: "synthetic",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
  });
  delete process.env.VERCEL_ENV;
  delete process.env.FIELDBOOK_ENVIRONMENT;
  let ready = true,
    mime = "image/png",
    path = `uploads/${file}`,
    signs = 0;
  let logo = reference;
  const requests: URL[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    let data: unknown;
    if (url.pathname.endsWith("fb_config")) {
      assert.ok(!url.searchParams.get("select")!.includes("*"));
      assert.ok(!url.searchParams.get("select")!.includes("draft"));
      data = {
        name: "Acme",
        logoUrl: logo,
        welcomeDescription: "Welcome aboard",
        access: "private",
        policyMode: "external",
        policyUrl: "https://example.test/privacy",
        registration: "SECRET",
        draft: "SECRET",
      };
    } else if (url.pathname.endsWith("fb_media")) {
      assert.equal(url.searchParams.get("ready"), "eq.true");
      data = ready ? { path, mime } : null;
    } else if (url.pathname.includes("/object/sign/")) {
      signs++;
      data = { signedURL: "/object/sign/synthetic" };
    } else throw new Error(`Unexpected ${url.pathname}`);
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    assert.deepEqual(await publicBranding(), {
      name: "Acme",
      logoUrl: `/api/branding/logo?v=${file}`,
      welcomeDescription: "Welcome aboard",
      access: "private",
      privacyUrl: "https://example.test/privacy",
    });
    await signedBrandingLogoUrl();
    assert.equal(signs, 1);
    for (const invalid of [
      "https://example.test/x.png",
      "/api/media/private.mp4",
      "//evil.test/x",
      "data:image/png,x",
    ])
      await assert.rejects(readyLogo(invalid));
    ready = false;
    await assert.rejects(signedBrandingLogoUrl(), /Logo not found/);
    ready = true;
    mime = "video/mp4";
    await assert.rejects(signedBrandingLogoUrl(), /Logo not found/);
    mime = "image/png";
    path = "uploads/different.png";
    await assert.rejects(signedBrandingLogoUrl(), /Logo not found/);
    logo = "";
    await assert.rejects(signedBrandingLogoUrl(), /Logo not found/);
    assert.equal(signs, 1);
    assert.ok(requests.every((u) => !u.pathname.includes("fb_documents")));
  } finally {
    globalThis.fetch = previous;
    process.env = oldEnv;
  }
  assert.deepEqual(brandingFromSettings({}), {
    name: "Fieldbook",
    logoUrl: "",
    welcomeDescription: "",
    access: "public",
    privacyUrl: null,
  });
  assert.equal(
    brandingFromSettings({ name: " ", logoUrl: "javascript:alert(1)" }).logoUrl,
    "",
  );
});

test("settings accepts old configurations and validates branding without separate login settings", () => {
  assert.equal(settingsSchema.parse(defaultSettings).welcomeDescription, "");
  assert.equal(
    settingsSchema.parse({
      ...defaultSettings,
      welcomeDescription: " Welcome ",
    }).welcomeDescription,
    "Welcome",
  );
  for (const patch of [
    { name: " " },
    { name: "x".repeat(61) },
    { welcomeDescription: "x".repeat(181) },
    { logoUrl: "/api/media/00000000-0000-4000-8000-000000000001.mp4" },
    { logoUrl: "https://example.test/logo.png" },
    {
      privacy: {
        ...defaultPrivacy,
        published: {
          ...defaultPrivacy.draft,
          mode: "external",
          url: "javascript:alert(1)",
        },
      },
    },
  ])
    assert.equal(
      settingsSchema.safeParse({ ...defaultSettings, ...patch }).success,
      false,
    );
});

test("cancelled, denied and unavailable authentication preserve safe destinations", () => {
  const previous = console.error;
  const logs: string[] = [];
  console.error = (line) => logs.push(line);
  try {
    for (const [error, kind] of [
      [undefined, "cancelled"],
      [new HttpError(403, "Not allowed"), "access"],
      [new ServiceError("Auth down", "auth"), "service"],
    ] as const) {
      const response = signInFailure(
        "https://example.test",
        "/oauth/consent?authorization_id=synthetic#details",
        error,
      );
      const url = new URL(response.headers.get("location")!);
      assert.equal(url.searchParams.get("error"), kind);
      assert.equal(!!url.searchParams.get("reference"), !!error);
      assert.equal(
        response.cookies.get(SIGN_IN_RETURN_COOKIE)?.value,
        "/oauth/consent?authorization_id=synthetic#details",
      );
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
    assert.equal(logs.length, 2);
    assert.ok(!logs.join("").includes("Auth down"));
  } finally {
    console.error = previous;
  }
  for (const unsafe of [
    "//evil.test",
    "/\\evil.test",
    "/auth/logout",
    "/docs/../auth/login",
    "/sign-in",
    "https://evil.test",
    "/\n/evil.test",
  ])
    assert.equal(safeNext(unsafe), "/");
  assert.equal(
    safeNext("/docs/guide?view=all#google"),
    "/docs/guide?view=all#google",
  );
});
