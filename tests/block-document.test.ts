import test from "node:test";
import assert from "node:assert/strict";
import {
  blockDocumentSchema,
  canonicalBody,
  exportBlockMarkdown,
  importMarkdownDocument,
  preserveBlockDocumentWrite,
} from "../lib/block-document";
import { readTableWidths, writeTableWidths } from "../lib/writing-table";
import { contentSignature } from "../lib/demo-publication";
import { seedContent } from "../lib/seed";

const source =
  '## Heading\n\nA **bold**, *italic*, ~~struck~~ paragraph with `code` and [a link](https://example.com).\n\n- One\n  - Nested\n- Two\n\n> A reminder.\n\n| Left | Right |\n| :--- | ---: |\n| A | B |\n\n```js\nconst message = "hello";\n```\n\n![A diagram](https://example.com/diagram.png)\n\n[Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n\n---';
test("all existing command content imports into versioned blocks and exports useful Markdown", () => {
  const doc = importMarkdownDocument(source),
    markdown = exportBlockMarkdown(doc);
  assert.equal(doc.version, 1);
  for (const type of [
    "heading",
    "paragraph",
    "bulletListItem",
    "quote",
    "table",
    "codeBlock",
    "image",
    "videoEmbed",
    "divider",
  ])
    assert.ok(
      doc.blocks.some((b) => b.type === type),
      type,
    );
  for (const text of [
    "Heading",
    "**bold**",
    "*italic*",
    "~~struck~~",
    "`code`",
    "Nested",
    "A reminder.",
    "hello",
    "https://example.com/diagram.png",
    "dQw4w9WgXcQ",
  ])
    assert.ok(markdown.includes(text), text);
  assert.equal(
    blockDocumentSchema.safeParse(JSON.parse(JSON.stringify(doc))).success,
    true,
  );
});
test("authored table widths and alignment survive import, block persistence and export", () => {
  const doc = importMarkdownDocument(
    writeTableWidths("| A | B |\n| :--- | ---: |\n| x | y |", [[224, 336]]),
  );
  const table = doc.blocks[0];
  assert.ok(table.content && !Array.isArray(table.content));
  assert.deepEqual(table.content.columnWidths, [224, 336]);
  assert.deepEqual(readTableWidths(exportBlockMarkdown(doc)).widths, [
    [224, 336],
  ]);
});
test("structured blocks override stale Markdown projections", () => {
  const doc = importMarkdownDocument("Authoritative text.");
  assert.equal(
    canonicalBody({ body: "stale text", bodyDocument: doc }).body,
    "Authoritative text.",
  );
});
test("metadata-only old clients preserve native documents and contradictory prose edits are rejected", () => {
  const previous = canonicalBody({
    body: "",
    bodyDocument: importMarkdownDocument("Original."),
  });
  assert.deepEqual(
    preserveBlockDocumentWrite(
      { body: previous.body, title: "Renamed" },
      previous,
    ).bodyDocument,
    previous.bodyDocument,
  );
  assert.throws(
    () => preserveBlockDocumentWrite({ body: "Replacement." }, previous),
    /uses blocks/,
  );
  assert.throws(
    () =>
      preserveBlockDocumentWrite(
        { ...previous, body: "Replacement." },
        previous,
      ),
    /generated/,
  );
});
test("unsupported legacy syntax fails without rewriting source", () => {
  for (const source of [
    "<script>alert(1)</script>",
    "text ![inline](https://example.com/image.png)",
    "A footnote[^one].\n\n[^one]: Details.",
  ])
    assert.throws(() => importMarkdownDocument(source), /recovery/);
});
test("duplicate IDs, unknown blocks and hostile URLs cannot enter a saved document", () => {
  const original = importMarkdownDocument("Safe.");
  assert.equal(
    blockDocumentSchema.safeParse({
      ...original,
      blocks: [...original.blocks, ...original.blocks],
    }).success,
    false,
  );
  for (const changes of [
    { type: "script" },
    { type: "image", props: { url: "javascript:alert(1)" } },
    { type: "videoEmbed", props: { url: "https://evil.example/embed" } },
  ]) {
    assert.equal(
      blockDocumentSchema.safeParse({
        ...original,
        blocks: [{ ...original.blocks[0], ...changes }],
      }).success,
      false,
    );
  }
});
test("blocks participate in draft/published comparison even when their text is unchanged", () => {
  const item = structuredClone(seedContent[0]);
  const before = contentSignature(item);
  item.bodyDocument = importMarkdownDocument(item.body);
  assert.notEqual(contentSignature(item), before);
});

test("checklists and collapsible sections export every child and retain hard line breaks", () => {
  const doc = importMarkdownDocument("- [x] Completed\n- [ ] Next");
  const parent = importMarkdownDocument("Details").blocks[0];
  parent.type = "toggleListItem";
  parent.children = importMarkdownDocument(
    "A nested explanation.\\\nA second line.",
  ).blocks;
  doc.blocks.push(parent);
  const saved = blockDocumentSchema.parse(doc);
  const markdown = exportBlockMarkdown(saved);
  assert.ok(markdown.includes("- [x] Completed"));
  assert.ok(markdown.includes("A nested explanation."));
  assert.ok(markdown.includes("A second line."));
  assert.ok(markdown.includes("\\\n"));
});

test("legacy lesson videos remain alongside an existing native document on its first edit", async () => {
  const { lessonWritingDocument } = await import("../lib/block-document");
  const original = importMarkdownDocument("Keep this lesson text.");
  const lesson = {
    id: "one",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    bodyDocument: original,
  };
  const before = JSON.stringify(lesson);
  const combined = lessonWritingDocument(lesson)!;
  assert.equal(combined.blocks[0].type, "videoEmbed");
  assert.ok(exportBlockMarkdown(combined).includes("dQw4w9WgXcQ"));
  assert.ok(exportBlockMarkdown(combined).includes("Keep this lesson text."));
  assert.equal(JSON.stringify(lesson), before);
  assert.deepEqual(lessonWritingDocument(lesson), combined);
});

test("recursive API inputs are bounded before schema parsing", async () => {
  const { assertBlockDocumentInputLimits } =
    await import("../lib/block-document");
  const document = importMarkdownDocument("A paragraph.");
  let current = document.blocks[0];
  for (let i = 0; i < 40; i++) {
    const child = importMarkdownDocument("Child").blocks[0];
    current.children = [child];
    current = child;
  }
  assert.throws(
    () => assertBlockDocumentInputLimits(document),
    /depth or size limit/,
  );
});

test("native links reject executable schemes and preserve web, email and relative destinations", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "java\nscript:alert(1)",
  ]) {
    const native = importMarkdownDocument("A paragraph.");
    native.blocks[0].content = [
      {
        type: "link",
        href: url,
        content: [{ type: "text", text: "Label", styles: {} }],
      },
    ];
    assert.equal(blockDocumentSchema.safeParse(native).success, false);
  }
  for (const url of [
    "https://example.com",
    "mailto:help@example.com",
    "/docs/example",
    "#heading-example",
  ])
    assert.doesNotThrow(() => importMarkdownDocument(`[Safe](${url})`));
});
