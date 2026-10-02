import test from "node:test";
import assert from "node:assert/strict";
import { getContent } from "../../server/content";
import { seedContent } from "../../lib/seed";
import { defaultSettings } from "../../lib/settings";
import { contentSignature } from "../../lib/demo-publication";
import type { User } from "../../lib/types";

test("published editor reads require publishing access and return the real publication with private quiz keys", async () => {
  const oldFetch = globalThis.fetch;
  const oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://published-editor.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "owner@example.test",
    FIELDBOOK_HOST: "node",
  });
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  const live = seedContent.find((item) => item.kind === "course")!;
  const row = {
    id: live.id,
    draft: { ...live, title: "Different draft", questions: [] },
    published: live,
    revision: 7,
    published_revision: 3,
    deleted_at: null,
  };
  let documentReads = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("fb_config"))
      return Response.json({
        settings: { ...defaultSettings, access: "public" },
      });
    assert.ok(url.pathname.endsWith("fb_documents"));
    documentReads++;
    return Response.json(row);
  };
  const user: User = {
    id: "publisher",
    name: "Publisher",
    email: "publisher@example.test",
    active: true,
    role: "admin",
    groups: [],
  };
  try {
    for (const role of ["learner", "manager"] as const)
      await assert.rejects(
        getContent(live.id, { ...user, role }, false, true),
        /publishing access/,
      );
    await assert.rejects(
      getContent(live.id, null, false, true),
      /Sign in to publish/,
    );
    assert.equal(documentReads, 0);
    for (const role of ["admin", "contributor"] as const) {
      const snapshot = await getContent(
        live.id,
        { ...user, role },
        false,
        true,
      );
      assert.equal(snapshot.title, live.title);
      assert.deepEqual(snapshot.questions, live.questions);
      assert.equal(snapshot.revision, 7);
      assert.equal(snapshot.publishedRevision, 3);
      assert.equal(snapshot.publishedSignature, contentSignature(live));
    }
    const reader = await getContent(live.id, null);
    assert.ok(
      reader.questions.every(
        (question) =>
          question.answer === undefined && !question.correctOptionIds,
      ),
    );
    assert.equal(reader.publishedSignature, undefined);
    row.published = null as any;
    await assert.rejects(getContent(live.id, user, false, true), /not found/);
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
});
