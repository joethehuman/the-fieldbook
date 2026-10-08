import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import Markdown from "../components/Markdown";
import { TooltipProvider } from "../components/ui/tooltip";
import { markdownHeadings } from "../lib/markdown-headings";
import { orderedDocs, type DocLink } from "../lib/docs-navigation";

test("outline and renderer agree for rich, repeated, Unicode and setext headings", () => {
  const body =
    "# Title\n\n## **Start** with `code`\n\n### Café & tea\n\n## Start with code\n\n## Start with code-2\n\nSetext heading\n---\n\n```md\n## Not a heading\n```";
  const headings = markdownHeadings(body);
  assert.deepEqual(
    headings.map((h) => h.id),
    [
      "heading-start-with-code",
      "heading-café-tea",
      "heading-start-with-code-2",
      "heading-start-with-code-2-2",
      "heading-setext-heading",
    ],
  );
  const html = renderToStaticMarkup(
    createElement(TooltipProvider, null, createElement(Markdown, { children: body, headingPrefix: "#" })),
  );
  for (const h of headings) {
    assert.ok(html.includes(`id="${h.id}"`));
    assert.ok(html.includes(`href="#${h.id}"`));
  }
  assert.deepEqual(
    markdownHeadings("A paragraph.\n\n```\n## Example\n```"),
    [],
  );
});
test("canonical order crosses sections and nested folders and excludes drafts", () => {
  const doc = (
    id: string,
    category: string,
    folder = "",
    status: "draft" | "published" = "published",
  ): DocLink => ({ id, title: id, category, folder, kind: "doc", status });
  const docs = [
    doc("nested", "Start", "Deep/Inside"),
    doc("last", "End"),
    doc("root", "Start"),
    doc("parent", "Start", "Deep"),
    doc("draft", "Secret", "", "draft"),
  ];
  assert.deepEqual(
    orderedDocs(docs, ["Secret", "Start", "End"]).map((d) => d.id),
    ["root", "parent", "nested", "last"],
  );
  assert.deepEqual(
    orderedDocs(
      docs.filter((d) => d.id !== "nested"),
      ["Start", "End"],
    ).map((d) => d.id),
    ["root", "parent", "last"],
  );
});
