import { test } from "node:test";
import assert from "node:assert/strict";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { answerCitations, citationLinks } from "../lib/ai-citations";
import type { AiCitation } from "../lib/ai";

const source = (id: string, contentId = id): AiCitation => ({
  id,
  contentId,
  passageId: id,
  publishedRevision: 1,
  kind: "doc",
  title: `Reference ${id}`,
  href: `/docs/${contentId}`,
  lessonId: null,
  lessonTitle: null,
});

test("citations use reading order, reuse numbers and combine passages at one destination", () => {
  const text = "First [S2][S4]. Second [S3][S4][S5]. Last [S6].";
  const verified = [
    source("S6"),
    source("S5", "S2"),
    source("S4"),
    source("S3"),
    source("S2"),
  ];
  const citations = answerCitations(text, verified);
  assert.deepEqual(
    citations.sources.map(({ number, source }) => [number, source.id]),
    [
      [1, "S2"],
      [2, "S4"],
      [3, "S3"],
      [4, "S6"],
    ],
  );
  assert.equal(citations.byId.get("S5"), citations.byId.get("S2"));
  const processor = unified()
    .use(remarkParse)
    .use(citationLinks, {
      numbers: Object.fromEntries(
        [...citations.byId].map(([id, citation]) => [id, citation.number]),
      ),
    });
  const tree = processor.runSync(processor.parse(text));
  const rendered = JSON.stringify(tree);
  assert.doesNotMatch(rendered, /\[S\d+\]/);
  assert.match(rendered, /__fieldbook-citation\/4/);
  assert.equal((rendered.match(/__fieldbook-citation\/2/g) || []).length, 2);
  const repeated = processor.runSync(processor.parse("[S2][S5][S2]"));
  assert.equal(
    (JSON.stringify(repeated).match(/__fieldbook-citation\/1/g) || []).length,
    1,
  );
});

test("only verified prose citations become links; code, model URLs and absent metadata stay inert", () => {
  const text =
    "`[S2]` [fake](/__fieldbook-citation/1) [outside](https://evil.example)\n\nReal [S4]. Unknown [S99].\n\n```text\n[S2]\n```\n\n[ref][route]\n\n[route]: /__fieldbook-citation/1";
  const citations = answerCitations(text, [source("S2"), source("S4")]);
  assert.deepEqual(
    citations.sources.map(({ source }) => source.id),
    ["S4"],
  );
  const processor = unified()
    .use(remarkParse)
    .use(citationLinks, {
      numbers: Object.fromEntries(
        [...citations.byId].map(([id, citation]) => [id, citation.number]),
      ),
    });
  const tree = processor.runSync(processor.parse(text));
  // Definitions remain data; existing links (including references) lose their wrapper.
  const links: string[] = [];
  function visit(node: any) {
    if (node.type === "link") links.push(node.url);
    node.children?.forEach(visit);
  }
  visit(tree);
  assert.deepEqual(links.filter(Boolean), ["/__fieldbook-citation/1"]);
  assert.match(JSON.stringify(tree), /\[S99\]/);
  const empty = answerCitations("Hi! [S4]", []);
  assert.deepEqual(empty.sources, []);
  const pending = unified()
    .use(remarkParse)
    .use(citationLinks, { numbers: {} });
  assert.doesNotMatch(
    JSON.stringify(pending.runSync(pending.parse("Hi! [S4]"))),
    /__fieldbook-citation/,
  );
});

test("different lessons retain distinct links even when their course is shared", () => {
  const lessons = ["first", "second"].map((lessonId, index) => ({
    ...source(`S${index + 1}`, "course"),
    kind: "course" as const,
    lessonId,
    href: `/courses/course?lesson=${lessonId}`,
  }));
  const citations = answerCitations("Read [S2][S1].", lessons);
  assert.deepEqual(
    citations.sources.map(({ source }) => source.lessonId),
    ["second", "first"],
  );
});

test("pending prose hides internal and partial source IDs until verified metadata arrives", () => {
  const pending = unified().use(remarkParse).use(citationLinks, {
    numbers: {},
    pending: true,
  });
  for (const tail of ["[", "[S", "[S1", "[S12", "[S12]", "[S12][S3]"]) {
    const tree: any = pending.runSync(pending.parse("Read the steps " + tail));
    assert.doesNotMatch(JSON.stringify(tree.children), /\[S|value.*\[$/);
    assert.equal(tree.children[0].children[0].value, "Read the steps ");
  }
  const code: any = pending.runSync(pending.parse("`[S12]` and prose [S12]."));
  assert.equal(code.children[0].children[0].value, "[S12]");
  assert.doesNotMatch(
    JSON.stringify(code.children[0].children.slice(1)),
    /\[S12\]/,
  );
  const complete = unified()
    .use(remarkParse)
    .use(citationLinks, {
      numbers: { S12: 1 },
      pending: false,
    });
  const tree = complete.runSync(complete.parse("Read the steps [S12]."));
  assert.match(JSON.stringify(tree), /__fieldbook-citation\/1/);
});

test("installed Streamdown updates cached citation processors when final metadata arrives", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { Streamdown, defaultRemarkPlugins } = await import("streamdown");
  const render = (numbers: Record<string, number>) =>
    renderToStaticMarkup(
      createElement(
        Streamdown,
        {
          mode: "static",
          skipHtml: true,
          controls: false,
          remarkPlugins: [
            ...Object.values(defaultRemarkPlugins),
            [citationLinks, { numbers }],
          ],
          components: { a: "a" },
        },
        "Read the published steps [S4].",
      ),
    );
  const pending = render({});
  assert.match(pending, /\[S4\]/);
  assert.doesNotMatch(pending, /__fieldbook-citation/);
  const complete = render({ S4: 1 });
  assert.doesNotMatch(complete, /\[S4\]/);
  assert.match(complete, /href="\/__fieldbook-citation\/1"/);
  // Another answer can number the same evidence ID differently.
  assert.match(render({ S4: 2 }), /href="\/__fieldbook-citation\/2"/);
});
