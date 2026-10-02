import test from "node:test";
import assert from "node:assert/strict";
import { uploadMedia } from "../../server/upload";
import { purgeDeleted } from "../../server/deletion-worker";
import { HttpError } from "../../server/errors";
import type { User } from "../../lib/types";

const admin: User = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Admin",
  email: "admin@example.test",
  role: "admin",
  active: true,
  groups: [],
};
const id = "00000000-0000-4000-8000-000000000002";
const path = `${admin.id}/${id}.png`;

async function fixture(
  handler: (url: URL, method: string, body: any) => unknown,
  run: () => Promise<void>,
) {
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    SUPABASE_SECRET_KEY: "server-secret-test-key",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: admin.email,
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "test.supabase.co");
    assert.equal(init?.cache, "no-store");
    const body = handler(
      url,
      init?.method || "GET",
      init?.body ? JSON.parse(String(init.body)) : undefined,
    );
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await run();
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
}

test("upload authorization and format/size checks run before provider access", async () => {
  await fixture(
    () => {
      throw new Error("Unexpected provider access");
    },
    async () => {
      const file = { name: "image.png", type: "image/png", size: 16 };
      await assert.rejects(uploadMedia(null, file), /Sign in/);
      await assert.rejects(
        uploadMedia({ ...admin, role: "learner" }, file),
        /Administrator/,
      );
      await assert.rejects(
        uploadMedia({ ...admin, active: false }, file),
        /Administrator/,
      );
      for (const invalid of [
        { ...file, type: "image/svg+xml" },
        { ...file, size: 0 },
        { ...file, size: 52428801 },
      ])
        await assert.rejects(uploadMedia(admin, invalid), /at most 50 MB/);
      process.env.FIELDBOOK_UPLOAD_MAX_BYTES = "10";
      await assert.rejects(uploadMedia(admin, file), /at most 50 MB/);
    },
  );
});

for (const role of ["admin", "contributor"] as const)
  test(`upload reservation returns a direct PUT instruction without provider credentials (${role})`, async () => {
  const publisher = { ...admin, role };
  let registered = false;
  await fixture(
    (url, method, body) => {
      if (url.pathname.endsWith("fb_allow_request")) {
        assert.equal(body.p_key, `uploads:${admin.id}`);
        assert.equal(body.p_limit, 20);
        assert.equal(body.p_seconds, 3600);
        return true;
      }
      if (url.pathname.endsWith("fb_media")) {
        assert.equal(method, "POST");
        assert.equal(body.owner, admin.id);
        assert.equal(body.mime, "image/png");
        assert.equal(body.bytes, 16);
        assert.equal(body.path, `${admin.id}/${body.id}.png`);
        registered = true;
        return null;
      }
      if (url.pathname.includes("/object/upload/sign/")) {
        assert(registered);
        assert.equal(method, "POST");
        return {
          url: `/object/upload/sign/fieldbook-media/${path}?token=synthetic`,
        };
      }
      throw new Error(`Unexpected request ${url.pathname}`);
    },
    async () => {
      const signed = await uploadMedia(publisher, {
        name: "image.png",
        type: "image/png",
        size: 16,
      });
      assert(signed.upload);
      assert.equal(signed.upload.method, "PUT");
      assert.equal(signed.upload.headers["Content-Type"], "image/png");
      assert.equal(signed.upload.headers["x-upsert"], "false");
      assert(signed.upload.url.endsWith("?token=synthetic"));
      assert.equal("token" in signed, false);
      assert.equal("path" in signed, false);
      assert(!JSON.stringify(signed).includes("server-secret-test-key"));
      assert(!JSON.stringify(signed).includes("publishable-test-key"));
    },
  );
});

test("upload rate rejection does not reserve or sign a file", async () => {
  await fixture(
    (url) => {
      assert(url.pathname.endsWith("fb_allow_request"));
      return false;
    },
    async () => {
      await assert.rejects(
        uploadMedia(admin, { name: "image.png", type: "image/png", size: 16 }),
        (error) => error instanceof HttpError && error.status === 429,
      );
    },
  );
});

for (const role of ["admin", "contributor"] as const)
  test(`completion verifies ownership, exact object, size and MIME before marking ready (${role})`, async () => {
  const publisher = { ...admin, role };
  let storedSize = 16,
    storedMime = "image/png",
    storedName = `${id}.png`,
    reservedPath = path,
    updates = 0;
  await fixture(
    (url, method, body) => {
      if (url.pathname.endsWith("fb_media") && method === "GET") {
        assert.equal(url.searchParams.get("id"), `eq.${id}`);
        assert.equal(url.searchParams.get("owner"), `eq.${admin.id}`);
        return {
          id,
          owner: admin.id,
          path: reservedPath,
          bytes: 16,
          mime: "image/png",
        };
      }
      if (url.pathname.endsWith("/object/list/fieldbook-media")) {
        assert.equal(body.prefix, admin.id);
        assert.equal(body.search, `${id}.png`);
        assert.equal(body.limit, 1);
        return [
          {
            name: storedName,
            metadata: { size: storedSize, mimetype: storedMime },
          },
        ];
      }
      if (url.pathname.endsWith("fb_media") && method === "PATCH") {
        assert.deepEqual(body, { ready: true });
        assert.equal(url.searchParams.get("id"), `eq.${id}`);
        updates++;
        return null;
      }
      throw new Error(`Unexpected ${method} ${url.pathname}`);
    },
    async () => {
      const complete = { complete: id };
      reservedPath = `another-owner/${id}.png`;
      await assert.rejects(uploadMedia(publisher, complete), /verification failed/);
      reservedPath = path;
      storedSize = 17;
      await assert.rejects(uploadMedia(publisher, complete), /verification failed/);
      storedSize = 16;
      storedMime = "video/mp4";
      await assert.rejects(uploadMedia(publisher, complete), /verification failed/);
      storedMime = "image/png";
      storedName = `extra-${id}.png`;
      await assert.rejects(uploadMedia(publisher, complete), /verification failed/);
      assert.equal(updates, 0);
      storedName = `${id}.png`;
      assert.deepEqual(await uploadMedia(publisher, complete), {
        url: `/api/media/${id}.png`,
      });
      assert.equal(updates, 1);
    },
  );
});

test("cleanup deletes storage before metadata and leaves failed objects queued for retry", async () => {
  const calls: string[] = [];
  let rejectRemoval = true;
  await fixture(
    (url, method, body) => {
      calls.push(`${method} ${url.pathname}`);
      if (url.pathname.endsWith("fb_claim_deletions")) return [];
      if (url.pathname.endsWith("fb_collect_deleted_media"))
        return [{ id, path }];
      if (url.pathname.endsWith("/object/fieldbook-media")) {
        assert.equal(method, "DELETE");
        assert.deepEqual(body.prefixes, [path]);
        if (rejectRemoval) throw new Error("Synthetic storage failure");
        return [];
      }
      if (url.pathname.endsWith("fb_media")) {
        assert.equal(method, "DELETE");
        assert.equal(url.searchParams.get("ready"), "eq.false");
        return null;
      }
      if (url.pathname.endsWith("fb_media_cleanup")) return null;
      throw new Error(`Unexpected ${method} ${url.pathname}`);
    },
    async () => {
      assert.deepEqual(await purgeDeleted("a".repeat(64)), {
        removed: 0,
        failed: 1,
      });
      assert(!calls.some((call) => call.endsWith("/fb_media")));
      assert(!calls.some((call) => call.endsWith("/fb_media_cleanup")));
      rejectRemoval = false;
      calls.length = 0;
      assert.deepEqual(await purgeDeleted("a".repeat(64)), {
        removed: 0,
        failed: 0,
      });
      assert(
        calls.findIndex((call) => call.includes("/object/fieldbook-media")) <
          calls.findIndex((call) => call.endsWith("/fb_media")),
      );
      assert(
        calls.findIndex((call) => call.endsWith("/fb_media")) <
          calls.findIndex((call) => call.endsWith("/fb_media_cleanup")),
      );
    },
  );
});
