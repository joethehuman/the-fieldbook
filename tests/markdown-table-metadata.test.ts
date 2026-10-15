import { test } from "node:test";
import assert from "node:assert/strict";
import { readTableWidths, writeTableWidths } from "../lib/markdown-table-metadata";

test("table width metadata survives a Markdown round trip and leaves old tables automatic", () => {
  const markdown = "Intro.\n\n| Topic | Detail |\n| --- | --- |\n| One | A paragraph |";
  assert.deepEqual(readTableWidths(markdown), { markdown, widths: [] });
  const sized = writeTableWidths(markdown, [[224, 336]]);
  assert.deepEqual(readTableWidths(sized), { markdown, widths: [[224, 336]] });
  assert.equal(writeTableWidths(sized, [[224, 336]]), sized);
  assert.equal(writeTableWidths(sized, [null]), markdown);
  assert.equal(readTableWidths("<!-- fieldbook-table-widths:v1 [[20]] -->\n\n" + markdown).markdown.startsWith("<!--"), true);
  assert.deepEqual(readTableWidths(writeTableWidths(markdown, [[2423, 194]])).widths, [[2423, 194]]);
});
