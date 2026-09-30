import { test } from "node:test";
import assert from "node:assert/strict";
import { assertAppKind } from "../scripts/app-kind.mjs";

test("Vercel cannot build a missing, wrong or unknown app identity", () => {
  for (const actual of ["installed", "demo"]) {
    for (const expected of [
      undefined,
      "other",
      actual === "demo" ? "installed" : "demo",
    ]) {
      assert.throws(() =>
        assertAppKind(actual, { VERCEL: "1", FIELDBOOK_APP_KIND: expected }),
      );
    }
    assert.doesNotThrow(() =>
      assertAppKind(actual, { VERCEL: "1", FIELDBOOK_APP_KIND: actual }),
    );
  }
});
test("ordinary local builds work; explicit local mismatches still fail", () => {
  assert.doesNotThrow(() => assertAppKind("installed", {}));
  assert.throws(() =>
    assertAppKind("installed", { FIELDBOOK_APP_KIND: "demo" }),
  );
});

test("build markers identify kind and source revision without installation secrets", async () => {
  const { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } =
    await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-marker-test-"));
  try {
    mkdirSync(join(directory, "scripts"));
    for (const script of ["app-kind.mjs", "build-marker.mjs"])
      copyFileSync(
        new URL(`../scripts/${script}`, import.meta.url),
        join(directory, "scripts", script),
      );
    for (const kind of ["installed", "demo"]) {
      execFileSync(
        process.execPath,
        [join(directory, "scripts/build-marker.mjs"), kind],
        {
          env: {
            ...process.env,
            VERCEL: "1",
            FIELDBOOK_APP_KIND: kind,
            VERCEL_GIT_COMMIT_SHA: "test-source-revision",
            SUPABASE_SECRET_KEY: "never-in-the-marker",
          },
        },
      );
      const marker = JSON.parse(
        readFileSync(
          join(
            directory,
            kind === "demo" ? "demo/public" : "public",
            "fieldbook-build.json",
          ),
          "utf8",
        ),
      );
      assert.deepEqual(marker, { kind, revision: "test-source-revision" });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
