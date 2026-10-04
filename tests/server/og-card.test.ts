import test from "node:test";
import assert from "node:assert/strict";
import { ogCardIdentity, ogCardImages } from "../../lib/og-card";
import { installationOgIdentity } from "../../server/og-card";

test("card identity bounds text and colors and uses only the canonical host", () => {
  assert.deepEqual(
    ogCardIdentity(
      { name: "  Acme  ", accent: "url(https://attacker.test)" },
      "https://user:password@example.test/path?secret=1",
    ),
    {
      name: "Acme",
      domain: "example.test",
      accent: "#0069ff",
    },
  );
  assert.equal(ogCardIdentity({ name: "x".repeat(100) }).name.length, 60);
  assert.deepEqual(ogCardIdentity({}, "javascript:alert(1)"), {
    name: "Fieldbook",
    domain: "",
    accent: "#0069ff",
  });
  const card = ogCardImages("https://example.test", "Acme");
  assert.equal(card.twitter.card, "summary_large_image");
  assert.equal(card.openGraph.images[0].url, "https://example.test/api/og?v=1");
  assert.deepEqual(card.twitter.images, card.openGraph.images);
});

test("private and public cards receive only the pre-login identity projection; failures fall back", async () => {
  const fetchBefore = globalThis.fetch;
  const envBefore = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
    SUPABASE_SECRET_KEY: "synthetic",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
  });
  delete process.env.VERCEL_ENV;
  delete process.env.FIELDBOOK_ENVIRONMENT;
  let access = "private";
  let fail = false;
  const queries: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    queries.push(url);
    assert.ok(url.pathname.endsWith("fb_config"));
    const selection = url.searchParams.get("select")!;
    assert.ok(
      !selection.includes("*") &&
        !selection.includes("draft") &&
        !selection.includes("groups"),
    );
    return new Response(
      JSON.stringify(
        fail
          ? { message: "SECRET PROVIDER FAILURE" }
          : {
              name: "Acme",
              accent: "#128C64",
              access,
              welcomeDescription: "SECRET WELCOME",
              draft: "SECRET DRAFT",
              teams: ["SECRET TEAM"],
            },
      ),
      {
        status: fail ? 500 : 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
  try {
    const privateCard = await installationOgIdentity();
    access = "public";
    assert.deepEqual(await installationOgIdentity(), privateCard);
    assert.deepEqual(privateCard, {
      name: "Acme",
      domain: "example.test",
      accent: "#128C64",
    });
    fail = true;
    assert.deepEqual(await installationOgIdentity(), {
      name: "Fieldbook",
      domain: "example.test",
      accent: "#0069ff",
    });
    assert.ok(queries.length >= 3);
  } finally {
    globalThis.fetch = fetchBefore;
    process.env = envBefore;
  }
});
