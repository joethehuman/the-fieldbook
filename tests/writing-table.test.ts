import { test } from "node:test";
import assert from "node:assert/strict";
import { moveTablePart, readTableWidths, setTableColumnWidths, tableColumnWidths, writeTableWidths } from "../lib/writing-table";
import type { TableNode } from "@mdxeditor/editor";

function fixture(): ReturnType<TableNode["getMdastNode"]> {
  return {
    type: "table",
    align: ["left", "center", "right"],
    children: ["Header", "One", "Two"].map((name) => ({
      type: "tableRow",
      children: ["A", "B", "C"].map((letter) => ({
        type: "tableCell",
        children: [
          {
            type: "strong",
            children: [{ type: "text", value: `${name} ${letter}` }],
          },
        ],
      })),
    })),
  };
}
test("row movement retains complete rich cells, can move to either edge and reverses without loss", () => {
  const table = fixture(),
    original = structuredClone(table);
  moveTablePart(table, "row", 2, 0);
  assert.deepEqual(table.children[0], original.children[2]);
  assert.deepEqual(table.align, original.align);
  moveTablePart(table, "row", 0, 2);
  assert.deepEqual(table, original);
});
test("column movement carries every row and its alignment, including empty and linked cells", () => {
  const table = fixture();
  table.children[1].children[1].children = [];
  table.children[2].children[1].children = [
    {
      type: "link",
      url: "https://example.com",
      children: [{ type: "text", value: "Reference" }],
    },
  ];
  const original = structuredClone(table);
  moveTablePart(table, "column", 1, 2);
  assert.deepEqual(table.align, ["left", "right", "center"]);
  table.children.forEach((row, i) =>
    assert.deepEqual(row.children[2], original.children[i].children[1]),
  );
  moveTablePart(table, "column", 2, 1);
  assert.deepEqual(table, original);
});
test("partial alignment is padded before moving; cancelled and stale destinations do not alter content", () => {
  const table = fixture();
  table.align = ["center"];
  moveTablePart(table, "column", 0, 2);
  assert.deepEqual(table.align, [null, null, "center"]);
  const before = structuredClone(table);
  for (const to of [-1, 3, NaN, 1.5]) moveTablePart(table, "row", 0, to);
  moveTablePart(table, "column", 1, 1);
  assert.deepEqual(table, before);
});

test("table width metadata survives a Markdown round trip and leaves old tables automatic", () => {
  const markdown = "Intro.\n\n| Topic | Detail |\n| --- | --- |\n| One | A paragraph |";
  assert.deepEqual(readTableWidths(markdown), { markdown, widths: [] });
  const sized = writeTableWidths(markdown, [[224, 336]]);
  assert.deepEqual(readTableWidths(sized), { markdown, widths: [[224, 336]] });
  assert.equal(writeTableWidths(sized, [[224, 336]]), sized);
  assert.equal(writeTableWidths(sized, [null]), markdown);
  assert.equal(readTableWidths("<!-- fieldbook-table-widths:v1 [[20]] -->\n\n" + markdown).markdown.startsWith("<!--"), true);
});

test("column movement carries width with cells and undo restores it", () => {
  const table = fixture();
  setTableColumnWidths(table, [180, 240, 320]);
  const before = structuredClone(table);
  moveTablePart(table, "row", 2, 0);
  assert.deepEqual(tableColumnWidths(table), [180, 240, 320]);
  moveTablePart(table, "row", 0, 2);
  moveTablePart(table, "column", 0, 2);
  assert.deepEqual(tableColumnWidths(table), [240, 320, 180]);
  moveTablePart(table, "column", 2, 0);
  assert.deepEqual(table, before);
});
