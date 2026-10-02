import test from "node:test";
import assert from "node:assert/strict";
import {
  uploadMediaFile,
  uploadFailure,
  type UploadProgress,
} from "../lib/upload-media";

const file = new File(["synthetic"], "image.png", { type: "image/png" });
const instruction = {
  id: "reserved",
  upload: {
    url: "https://storage.example.test/signed",
    method: "PUT",
    headers: { "Content-Type": "image/png" },
  },
};

test("upload returns a media reference only after transfer and verification with progress", async () => {
  const previous = globalThis.fetch;
  const calls: string[] = [],
    progress: UploadProgress[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).startsWith("https://")) {
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.body, file);
      return new Response(null, { status: 200 });
    }
    const body = JSON.parse(String(init?.body));
    return Response.json(
      body.complete ? { url: "/api/media/ready.png" } : instruction,
    );
  };
  try {
    assert.equal(
      await uploadMediaFile(file, (value) => progress.push(value)),
      "/api/media/ready.png",
    );
    assert.deepEqual(calls, [
      "/api/upload",
      instruction.upload.url,
      "/api/upload",
    ]);
    assert.deepEqual(
      progress.map((p) => p.stage),
      ["preparing", "uploading", "uploading", "verifying"],
    );
    assert.equal(progress.at(-1)?.uploaded, file.size);
  } finally {
    globalThis.fetch = previous;
  }
});

for (const failure of [
  "signing",
  "storage",
  "network",
  "verification",
] as const) {
  test(`${failure} failure returns no reference, and a fresh file retry can succeed`, async () => {
    const previous = globalThis.fetch;
    let failed = true,
      finalized = 0;
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith("https://")) {
        if (failed && failure === "network")
          throw new TypeError("private signed URL detail");
        return new Response(null, {
          status: failed && failure === "storage" ? 413 : 200,
        });
      }
      const body = JSON.parse(String(init?.body));
      if (body.complete) {
        finalized++;
        return failed && failure === "verification"
          ? Response.json(
              { error: "Upload verification failed." },
              { status: 400 },
            )
          : Response.json({ url: "/api/media/ready.png" });
      }
      return failed && failure === "signing"
        ? Response.json({ error: "Sign in to continue." }, { status: 401 })
        : Response.json(instruction);
    };
    try {
      await assert.rejects(uploadMediaFile(file), (error: Error) => {
        assert(!error.message.includes("private signed URL detail"));
        return /Could not start|file-size limit|connection was interrupted|could not be verified/.test(
          error.message,
        );
      });
      assert.equal(finalized, failure === "verification" ? 1 : 0);
      failed = false;
      assert.equal(await uploadMediaFile(file), "/api/media/ready.png");
    } finally {
      globalThis.fetch = previous;
    }
  });
}

test("storage failures explain useful categories without reflecting provider messages or URLs", () => {
  for (const status of [0, 400, 401, 403, 404, 409, 413, 415, 429, 503]) {
    const message = uploadFailure(
      status,
      JSON.stringify({ message: "https://private.example.test/?token=secret" }),
    );
    assert(!message.includes("private.example"));
    assert(!message.includes("token="));
  }
  assert.match(
    uploadFailure(400, '{"error":"EntityTooLarge"}'),
    /file-size limit/,
  );
  assert.match(uploadFailure(403), /permission expired or was denied/);
});
