import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "../components/Markdown";
import { writeTableWidths } from "../lib/writing-table";

test("published Markdown uses saved column measures without showing metadata", () => {
  const body = "| Short | Long prose |\n| --- | --- |\n| A | This paragraph can wrap inside its cell. |";
  const html = renderToStaticMarkup(createElement(Markdown, {
    children: writeTableWidths(body, [[192, 288]]),
  }));
  assert.match(html, /<colgroup><col style="width:192px"\/><col style="width:288px"\/><\/colgroup>/);
  assert.match(html, /style="width:480px"/);
  assert.doesNotMatch(html, /fieldbook-table-widths/);
  assert.match(html, /This paragraph can wrap inside its cell/);
});

test("existing tables retain automatic layout", () => {
  const html = renderToStaticMarkup(createElement(Markdown, {
    children: "| One | Two |\n| --- | --- |\n| A | B |",
  }));
  assert.doesNotMatch(html, /authored-table-sized|<colgroup>/);
  assert.match(html, /style="width:max-content"/);
});

test("saved widths follow top-level tables without sizing a quoted table", () => {
  const body = "> | Quoted | Table |\n> | --- | --- |\n> | One | Two |\n\n" +
    "| First | Table |\n| --- | --- |\n| A | B |\n\n" +
    "| Second | Table |\n| --- | --- |\n| C | D |";
  const html = renderToStaticMarkup(createElement(Markdown, {
    children: writeTableWidths(body, [[192, 288], [240, 320]]),
  }));
  assert.equal((html.match(/<colgroup>/g) || []).length, 2);
  assert.match(html, /<blockquote>[\s\S]*?style="width:max-content"[\s\S]*?<\/blockquote>/);
  assert.match(html, /<colgroup><col style="width:192px"\/><col style="width:288px"\/><\/colgroup>[\s\S]*<colgroup><col style="width:240px"\/><col style="width:320px"\/><\/colgroup>/);
});
