import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cellRectangle, clearTableCells, decodeTableClipboard, pasteTableCells,
  selectedTable, tableClipboardText, tableFromTsv, type WritingTable,
} from "../lib/writing-table-selection";
import { setTableColumnWidths, tableColumnWidths } from "../lib/writing-table";

function fixture(): WritingTable {
  return {
    type: "table", align: ["left", "center", "right"],
    children: ["Header", "One", "Two"].map(name => ({
      type: "tableRow", children: ["A", "B", "C"].map(letter => ({
        type: "tableCell", children: [{ type: "strong", children: [{ type: "text", value: `${name} ${letter}` }] }],
      })),
    })),
  };
}

test("a backward rectangle copies complete cells including empty cells, inline formatting, alignment and widths", () => {
  const table = fixture();
  table.children[1].children[1].children = [];
  setTableColumnWidths(table, [180, 220, 260]);
  const slice = selectedTable(table, cellRectangle({ row: 2, column: 2 }, { row: 1, column: 1 }));
  assert.equal(tableClipboardText(slice), "\tOne C\nTwo B\tTwo C");
  assert.deepEqual(slice.align, ["center", "right"]);
  assert.deepEqual(tableColumnWidths(slice), [220, 260]);
  assert.equal(slice.children[1].children[0].children[0].type, "strong");
  slice.children[1].children[0].children = [];
  assert.notDeepEqual(slice.children[1].children[0], table.children[2].children[1]);
});

test("pasting grows the rectangle without shifting existing cells and preserves destination layout", () => {
  const table = fixture(), original = structuredClone(table);
  setTableColumnWidths(table, [180, 220, 260]);
  const source = selectedTable(fixture(), { top: 0, bottom: 1, left: 0, right: 1 });
  assert.deepEqual(pasteTableCells(table, source, { top: 2, bottom: 2, left: 2, right: 2 }), { top: 2, bottom: 3, left: 2, right: 3 });
  assert.equal(table.children.length, 4);
  assert.ok(table.children.every(row => row.children.length === 4));
  assert.deepEqual(table.children[0].children[0], original.children[0].children[0]);
  assert.deepEqual(table.children[2].children[2], source.children[0].children[0]);
  assert.deepEqual(table.align, ["left", "center", "right", null]);
  assert.deepEqual(tableColumnWidths(table), [180, 220, 260, 260]);
});

test("a single copied cell fills a selection, while cut clears contents and preserves the grid", () => {
  const table = fixture();
  const rectangle = { top: 1, bottom: 2, left: 0, right: 1 };
  const source = selectedTable(table, { top: 0, bottom: 0, left: 0, right: 0 });
  pasteTableCells(table, source, rectangle);
  assert.equal(tableClipboardText(selectedTable(table, rectangle)), "Header A\tHeader A\nHeader A\tHeader A");
  clearTableCells(table, rectangle);
  assert.equal(tableClipboardText(selectedTable(table, rectangle)), "\t\n\t");
  assert.equal(table.children.length, 3);
  assert.equal(table.children[1].children.length, 3);
  assert.equal(table.children[1].children[2].children[0].type, "strong");
});

test("clipboard validation strips cached identities and unsafe URLs while retaining supported rich cells", () => {
  const table = fixture();
  Object.assign(table.children[0].children[0], { __cacheKey: "stale-editor" });
  table.children[1].children[0].children = [{ type: "link", url: "javascript:alert(1)", children: [{ type: "text", value: "Unsafe" }] }];
  table.children[1].children[1].children = [{ type: "link", url: "https://example.com", children: [{ type: "text", value: "Safe" }] }];
  const decoded = decodeTableClipboard(JSON.stringify({ version: 1, table }))!;
  assert.ok(decoded);
  assert.equal("__cacheKey" in decoded.children[0].children[0], false);
  assert.deepEqual(decoded.children[1].children[0].children, [{ type: "text", value: "Unsafe" }]);
  assert.equal(decoded.children[1].children[1].children[0].type, "link");
  assert.equal(decodeTableClipboard(JSON.stringify({ version: 2, table })), null);
  table.children[1].children.pop();
  assert.equal(decodeTableClipboard(JSON.stringify({ version: 1, table })), null);
});

test("quoted tab-separated text round trips empty, multiline and quoted cells", () => {
  const text = 'One\t"Two\tparts"\t\r\n"Line\nbreak"\t"A ""quote"""\tEnd\r\n';
  const table = tableFromTsv(text)!;
  assert.equal(table.children.length, 2);
  assert.equal(table.children[0].children.length, 3);
  assert.equal(tableClipboardText(table), 'One\t"Two\tparts"\t\n"Line\nbreak"\t"A ""quote"""\tEnd');
  assert.equal(tableFromTsv("ordinary prose\nwith a line break"), null);
  assert.equal(tableFromTsv('"unfinished\tfield'), null);
});

test("oversized pastes leave the destination unchanged", () => {
  const table = fixture(), before = structuredClone(table);
  const source = fixture();
  assert.equal(pasteTableCells(table, source, { top: 999, bottom: 999, left: 0, right: 0 }), null);
  assert.deepEqual(table, before);
});
