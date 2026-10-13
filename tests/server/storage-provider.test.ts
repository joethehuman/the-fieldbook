import { test } from "node:test";
import assert from "node:assert/strict";
import { supabaseStorage } from "../../server/providers/supabase/storage";

test("resumable uploads preserve a self-hosted API prefix and the hosted storage hostname", async () => {
  const environment = { ...process.env };
  const savedFetch = globalThis.fetch;
  process.env = {
    NODE_ENV: "test",
    FIELDBOOK_HOST: "node",
    FIELDBOOK_URL: "https://learn.example.test",
    FIELDBOOK_OWNER_EMAIL: "owner@example.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public",
    SUPABASE_SECRET_KEY: "synthetic-server",
  };
  try {
    for (const [api, endpoint] of [
      [
        "https://learn.example.test/backend",
        "https://learn.example.test/backend/storage/v1/upload/resumable/sign",
      ],
      [
        "https://isolated.supabase.co",
        "https://isolated.storage.supabase.co/storage/v1/upload/resumable/sign",
      ],
    ]) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = api;
      globalThis.fetch = async (input) => {
        assert.equal(
          String(input),
          `${api}/storage/v1/object/upload/sign/fieldbook-media/content/video.mp4`,
        );
        return Response.json({
          url: "/object/upload/sign/fieldbook-media/content/video.mp4?token=synthetic-signature",
        });
      };
      const upload = await supabaseStorage.createUpload(
        "content/video.mp4",
        "video/mp4",
        7 * 1024 * 1024,
      );
      assert.ok("protocol" in upload);
      assert.equal(upload.protocol, "tus");
      assert.equal(upload.url, endpoint);
      assert.equal(upload.headers?.["x-signature"], "synthetic-signature");
    }
  } finally {
    process.env = environment;
    globalThis.fetch = savedFetch;
  }
});
