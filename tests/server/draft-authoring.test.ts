import test from "node:test";
import assert from "node:assert/strict";
import { contentDraftSchema, contentSchema } from "../../server/schemas";
import { document, redact } from "../../server/content";
import { seedContent } from "../../lib/seed";
import { contentSignature } from "../../lib/demo-publication";
const initial = {
  ...seedContent.find((c) => c.kind === "course")!,
  id: "00000000-0000-4000-8000-000000000011",
};
test("incomplete drafts retain bounded values and IDs without weakening publication or media validation", () => {
  const incomplete = {
    ...initial,
    title: "",
    category: "",
    summary: "",
    cardArt: { source: "generated", shortTitle: "", seed: 1, version: 2 },
    questions: [
      { id: "q", prompt: "", options: ["", ""], correctOptionIds: [] },
    ],
  };
  assert.equal(contentDraftSchema.safeParse(incomplete).success, true);
  assert.equal(contentSchema.safeParse(incomplete).success, false);
  assert.equal(
    contentDraftSchema.safeParse({ ...incomplete, title: "a".repeat(161) })
      .success,
    false,
  );
  assert.equal(
    contentDraftSchema.safeParse({
      ...incomplete,
      questions: [incomplete.questions[0], incomplete.questions[0]],
    }).success,
    false,
  );
  assert.equal(
    contentDraftSchema.safeParse({
      ...incomplete,
      cardArt: {
        ...incomplete.cardArt,
        imageUrl: "https://example.test/image.png",
      },
    }).success,
    false,
  );
});
test("published answer comparison is admin-only and stripped from reader payloads", () => {
  const row = {
    draft: initial,
    published: initial,
    revision: 4,
    published_revision: 2,
  };
  const admin = document(row, true);
  assert.equal(admin.publishedSignature, contentSignature(initial));
  assert.equal(document(row).publishedSignature, undefined);
  assert.equal(redact(admin).publishedSignature, undefined);
  assert.ok(
    redact(admin).questions.every(
      (q) => !q.correctOptionIds && q.answer === undefined,
    ),
  );
});
