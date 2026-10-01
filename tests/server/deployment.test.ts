import { test } from "node:test";
import assert from "node:assert/strict";
import { deployment, clientAddress } from "../../server/deployment";
import { env, siteOrigins } from "../../server/env";

test("host configuration keeps Vercel trusted preview origins and canonical production", () => {
  const base = { VERCEL: "1", FIELDBOOK_URL: "https://learn.example.test" };
  assert.deepEqual(deployment({ ...base, VERCEL_ENV: "production" }), {
    host: "vercel",
    preview: false,
    origin: base.FIELDBOOK_URL,
    additionalOrigins: [],
  });
  assert.deepEqual(
    deployment({
      ...base,
      VERCEL_ENV: "preview",
      VERCEL_BRANCH_URL: "branch.vercel.app",
      VERCEL_URL: "unique.vercel.app",
    }),
    {
      host: "vercel",
      preview: true,
      origin: "https://branch.vercel.app",
      additionalOrigins: ["https://unique.vercel.app"],
    },
  );
  assert.throws(
    () => deployment({ ...base, FIELDBOOK_HOST: "node" }),
    /hosting/,
  );
  assert.throws(
    () => deployment({ FIELDBOOK_HOST: "digitalocean" }),
    /hosting/,
  );
});

test("Node uses the operator origin and never adopts Vercel hostname variables", () => {
  assert.deepEqual(
    deployment({
      FIELDBOOK_HOST: "node",
      FIELDBOOK_ENVIRONMENT: "preview",
      FIELDBOOK_URL: "https://preview.example.test",
      VERCEL_BRANCH_URL: "unrelated.vercel.app",
      VERCEL_URL: "other.vercel.app",
    }),
    {
      host: "node",
      preview: true,
      origin: "https://preview.example.test",
      additionalOrigins: [],
    },
  );
});

test("Node preview retains the same explicit isolated backend guard", () => {
  const saved = process.env;
  process.env = {
    NODE_ENV: "test",
    FIELDBOOK_HOST: "node",
    FIELDBOOK_ENVIRONMENT: "preview",
    FIELDBOOK_URL: "https://preview.example.test/path",
    FIELDBOOK_OWNER_EMAIL: "owner@example.test",
    NEXT_PUBLIC_SUPABASE_URL: "https://isolated.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
    SUPABASE_SECRET_KEY: "synthetic",
  };
  try {
    assert.throws(env, /isolated/);
    process.env.FIELDBOOK_PREVIEW_SUPABASE_REF = "production";
    assert.throws(env, /isolated/);
    process.env.FIELDBOOK_PREVIEW_SUPABASE_REF = "isolated";
    assert.equal(env().origin, "https://preview.example.test");
    assert.deepEqual(siteOrigins(), ["https://preview.example.test"]);
  } finally {
    process.env = saved;
  }
});

test("address headers are trusted only by the selected hosting implementation", () => {
  const saved = process.env;
  const request = new Request("https://learn.example.test/api/feedback", {
    headers: { "x-vercel-forwarded-for": "192.0.2.1, 192.0.2.2" },
  });
  try {
    process.env = { NODE_ENV: "test", FIELDBOOK_HOST: "node" };
    assert.equal(clientAddress(request), null);
    process.env.FIELDBOOK_HOST = "vercel";
    assert.equal(clientAddress(request), "192.0.2.1");
  } finally {
    process.env = saved;
  }
});
