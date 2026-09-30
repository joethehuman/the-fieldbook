import test from "node:test";
import assert from "node:assert/strict";
import { contentSchema, settingsSchema } from "../../server/schemas";
import { saveContent, document } from "../../server/content";
import { defaultSettings } from "../../lib/settings";
import { seedContent } from "../../lib/seed";

const imageId = "00000000-0000-4000-8000-000000000010";
const cover = `/api/media/${imageId}.png`;
const course = {
  ...seedContent.find((c) => c.kind === "course")!,
  id: "00000000-0000-4000-8000-000000000011",
  coverImageUrl: cover,
};
const admin = {
  id: "00000000-0000-4000-8000-000000000012",
  name: "Admin",
  email: "admin@example.test",
  role: "admin" as const,
  groups: [],
  active: true,
};

test("cover and navigation schemas preserve new fields and accept older documents", () => {
  assert.equal(contentSchema.parse(course).coverImageUrl, cover);
  const { coverImageUrl, ...old } = course;
  assert.equal(contentSchema.parse(old).coverImageUrl, undefined);
  assert.equal(
    contentSchema.parse({ ...course, coverImageUrl: "" }).coverImageUrl,
    "",
  );
  for (const url of [
    "https://example.test/image.png",
    "javascript:alert(1)",
    `/api/media/${imageId}.mp4`,
  ])
    assert.equal(
      contentSchema.safeParse({ ...course, coverImageUrl: url }).success,
      false,
    );
  assert.deepEqual(
    settingsSchema.parse({
      ...defaultSettings,
      docCategoryOrder: ["Start", "Reference"],
    }).docCategoryOrder,
    ["Start", "Reference"],
  );
  assert.equal(
    settingsSchema.safeParse({
      ...defaultSettings,
      docCategoryOrder: ["Start", "Start"],
    }).success,
    false,
  );
  assert.equal(settingsSchema.safeParse(defaultSettings).success, true);
});

test("cover saves require admin, ready image media and a current revision; drafts preserve the published cover", async () => {
  const originalFetch = globalThis.fetch;
  const oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
  });
  let media: { id: string; mime: string }[] = [
    { id: imageId, mime: "image/png" },
  ];
  let row = {
    draft: { ...course, coverImageUrl: "" },
    published: { ...course, coverImageUrl: "" },
    revision: 1,
    published_revision: 1,
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    let response: unknown;
    if (url.includes("/rpc/fb_save_document")) {
      const args = JSON.parse(String(init?.body));
      row = {
        draft: args.p_draft,
        published: args.p_publish ? args.p_draft : row.published,
        revision: row.revision + 1,
        published_revision: args.p_publish
          ? row.revision + 1
          : row.published_revision,
      };
      response = row;
    } else if (url.includes("fb_documents")) response = row;
    else if (url.includes("fb_media")) response = media;
    else throw new Error(`Unexpected request ${url}`);
    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await assert.rejects(() => saveContent(null, course, 1), /Sign in/i);
    await assert.rejects(
      () => saveContent({ ...admin, role: "learner" }, course, 1),
      /administrator/i,
    );
    await assert.rejects(() => saveContent(admin, course, 0), /changed since/);
    media = [];
    await assert.rejects(() => saveContent(admin, course, 1), /not ready/);
    media = [{ id: imageId, mime: "video/mp4" }];
    await assert.rejects(() => saveContent(admin, course, 1), /image/);
    media = [{ id: imageId, mime: "image/png" }];
    const draft = await saveContent(admin, course, 1);
    assert.equal(draft.coverImageUrl, cover);
    assert.equal(document(row).coverImageUrl, "");
    await saveContent(admin, { ...course, assignments: [] }, 2, true);
    assert.equal(document(row).coverImageUrl, cover);
    await saveContent(
      admin,
      { ...course, coverImageUrl: "", assignments: [] },
      3,
      true,
    );
    assert.equal(document(row).coverImageUrl, "");
  } finally {
    globalThis.fetch = originalFetch;
    process.env = oldEnv;
  }
});
