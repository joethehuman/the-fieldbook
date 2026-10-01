import test from "node:test";
import assert from "node:assert/strict";
import { data } from "../../server/data";
import { HttpError, ServiceError } from "../../server/errors";
import { seedContent } from "../../lib/seed";
import { defaultSettings } from "../../lib/settings";

async function withBackend(
  fetch: typeof globalThis.fetch,
  run: () => Promise<void>,
) {
  const savedFetch = globalThis.fetch;
  const savedEnvironment = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://data-contract.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://fieldbook.example",
    FIELDBOOK_OWNER_EMAIL: "owner@example.test",
    FIELDBOOK_HOST: "node",
  });
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  globalThis.fetch = fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = savedFetch;
    process.env = savedEnvironment;
  }
}

test("document writes retain the atomic revision gate and return a plain saved record", async () => {
  const {
    revision: _revision,
    publishedRevision: _publishedRevision,
    ...draft
  } = seedContent[0];
  const saved = {
    id: draft.id,
    revision: 8,
    draft,
    published: draft,
    published_revision: 8,
    updated_at: "2026-10-01T00:00:00Z",
  };
  let requests = 0;
  await withBackend(
    async (input, init) => {
      requests++;
      assert.equal(
        new URL(String(input)).pathname,
        "/rest/v1/rpc/fb_save_document",
      );
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_id: draft.id,
        p_expected: 7,
        p_draft: draft,
        p_publish: true,
        p_unpublish: false,
        p_actor: "administrator",
        p_source: "test",
      });
      return Response.json(saved);
    },
    async () => {
      assert.deepEqual(
        await data().saveDocument({
          id: draft.id,
          expected: 7,
          draft,
          publish: true,
          unpublish: false,
          actorId: "administrator",
          source: "test",
        }),
        saved,
      );
      assert.equal(requests, 1);
    },
  );
});

test("settings writes retain both settings and governance revision gates", async () => {
  await withBackend(
    async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/rest/v1/fb_config");
      assert.equal(url.searchParams.get("id"), "eq.true");
      assert.equal(url.searchParams.get("revision"), "eq.4");
      assert.equal(url.searchParams.get("governance_revision"), "eq.9");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        settings: defaultSettings,
        revision: 5,
      });
      return Response.json({ revision: 5 });
    },
    async () => {
      assert.deepEqual(await data().updateSettings(defaultSettings, 4, 9), {
        revision: 5,
      });
      assert.equal(
        data().cacheNamespace(),
        "https://data-contract.supabase.co",
      );
    },
  );
});

test("adapter errors retain revision and validation responses without exporting provider errors", async () => {
  const {
    revision: _revision,
    publishedRevision: _publishedRevision,
    ...draft
  } = seedContent[0];
  const write = {
    id: draft.id,
    expected: 1,
    draft,
    publish: false,
    unpublish: false,
    actorId: "administrator",
    source: "test",
  };
  let failure = { code: "P0001", message: "Revision conflict" };
  await withBackend(
    async () => Response.json(failure, { status: 400 }),
    async () => {
      await assert.rejects(
        data().saveDocument(write),
        (error: unknown) => error instanceof HttpError && error.status === 409,
      );
      failure = {
        code: "P0001",
        message: "Restore this item before editing it.",
      };
      await assert.rejects(
        data().saveDocument(write),
        (error: unknown) =>
          error instanceof HttpError &&
          error.status === 400 &&
          error.message === failure.message,
      );
      failure = { code: "42501", message: "Private upstream database detail" };
      await assert.rejects(
        data().saveDocument(write),
        (error: unknown) =>
          error instanceof ServiceError &&
          error.status === 503 &&
          !error.message.includes("Private"),
      );
      await assert.rejects(
        data().findCurriculumArtwork(["image"]),
        (error: unknown) =>
          error instanceof Error &&
          !(error instanceof HttpError) &&
          !error.message.includes("Private"),
      );
      await assert.rejects(
        data().findOwnerProfile("owner@example.test"),
        (error: unknown) =>
          error instanceof Error &&
          !(error instanceof HttpError) &&
          !error.message.includes("Private"),
      );
    },
  );
});
