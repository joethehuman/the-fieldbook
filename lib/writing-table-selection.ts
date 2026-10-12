import type { TableNode } from "@mdxeditor/editor";
import { setTableColumnWidths, tableColumnWidths } from "./writing-table";
import { normalizeContentLink } from "./content-links";

export type WritingTable = ReturnType<TableNode["getMdastNode"]>;
export type CellPoint = { row: number; column: number };
export type CellRectangle = { top: number; bottom: number; left: number; right: number };
export const TABLE_CLIPBOARD_TYPE = "application/x-fieldbook-table+json";
const MAX_ROWS = 1000;
const MAX_COLUMNS = 100;
const MAX_CLIPBOARD_LENGTH = 1_000_000;

export function cellRectangle(anchor: CellPoint, focus: CellPoint): CellRectangle {
  return {
    top: Math.min(anchor.row, focus.row), bottom: Math.max(anchor.row, focus.row),
    left: Math.min(anchor.column, focus.column), right: Math.max(anchor.column, focus.column),
  };
}

export function selectedTable(table: WritingTable, rectangle: CellRectangle): WritingTable {
  const { top, bottom, left, right } = rectangle;
  const result: WritingTable = {
    type: "table",
    align: table.align?.slice(left, right + 1),
    children: table.children.slice(top, bottom + 1).map(row => ({
      type: "tableRow", children: row.children.slice(left, right + 1).map(cell => ({
        type: "tableCell", children: structuredClone(cell.children),
      })),
    })),
  };
  const widths = tableColumnWidths(table);
  if (widths) setTableColumnWidths(result, widths.slice(left, right + 1));
  return result;
}

/** Replace cell objects so MDXEditor's nested editors remount with the new contents. */
export function clearTableCells(table: WritingTable, rectangle: CellRectangle) {
  for (let row = rectangle.top; row <= rectangle.bottom; row++)
    for (let column = rectangle.left; column <= rectangle.right; column++)
      if (table.children[row]?.children[column])
        table.children[row].children[column] = { type: "tableCell", children: [] };
}

/** Paste from the destination cell, growing the grid without shifting existing cells. */
export function pasteTableCells(table: WritingTable, source: WritingTable, destination: CellRectangle): CellRectangle | null {
  const repeat = source.children.length === 1 && source.children[0]?.children.length === 1;
  const rows = repeat ? destination.bottom - destination.top + 1 : source.children.length;
  const columns = repeat ? destination.right - destination.left + 1 : source.children[0]?.children.length || 0;
  const bottom = destination.top + rows - 1, right = destination.left + columns - 1;
  if (!rows || !columns || bottom >= MAX_ROWS || right >= MAX_COLUMNS) return null;
  const width = Math.max(table.children[0]?.children.length || 0, right + 1);
  const widths = tableColumnWidths(table)?.slice();
  while (table.children.length <= bottom) table.children.push({ type: "tableRow", children: [] });
  table.children.forEach(row => {
    while (row.children.length < width) row.children.push({ type: "tableCell", children: [] });
  });
  if (table.align) while (table.align.length < width) table.align.push(null);
  if (widths) {
    while (widths.length < width) widths.push(widths.at(-1)!);
    setTableColumnWidths(table, widths);
  }
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++)
      table.children[destination.top + row].children[destination.left + column] = {
        type: "tableCell", children: structuredClone(source.children[repeat ? 0 : row].children[repeat ? 0 : column].children),
      };
  return { ...destination, bottom, right };
}

type Inline = WritingTable["children"][number]["children"][number]["children"][number];
type UnknownNode = { type?: unknown; value?: unknown; children?: unknown; url?: unknown; title?: unknown; alt?: unknown };
const safeUrl = (value: unknown) => typeof value === "string" && value.length <= MAX_CLIPBOARD_LENGTH
  && !/^(?:javascript|data|vbscript):/i.test(value.replace(/[\u0000-\u0020\u007f]/g, "")) ? normalizeContentLink(value) : "";

/** Clipboard JSON is untrusted; only recreate supported inline content, never cached node keys. */
function inlineNodes(value: unknown, depth = 0): Inline[] | null {
  if (!Array.isArray(value) || depth > 20 || value.length > 10000) return null;
  const result: Inline[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const node = item as UnknownNode;
    if ((node.type === "text" || node.type === "inlineCode") && typeof node.value === "string")
      result.push({ type: node.type, value: node.value });
    else if (node.type === "break") result.push({ type: "break" });
    else if (["strong", "emphasis", "delete", "link"].includes(String(node.type))) {
      const children = inlineNodes(node.children, depth + 1);
      if (!children) return null;
      if (node.type === "link") {
        const url = safeUrl(node.url);
        if (url) result.push({ type: "link", url, title: typeof node.title === "string" ? node.title : null, children });
        else result.push(...children);
      } else result.push({ type: node.type as "strong" | "emphasis" | "delete", children });
    } else if (node.type === "image") {
      const url = safeUrl(node.url);
      if (url) result.push({ type: "image", url, alt: typeof node.alt === "string" ? node.alt : "", title: typeof node.title === "string" ? node.title : null });
    } else return null;
  }
  return result;
}

export function decodeTableClipboard(value: string): WritingTable | null {
  if (!value || value.length > MAX_CLIPBOARD_LENGTH) return null;
  try {
    const payload = JSON.parse(value);
    const source = payload.version === 1 && payload.table;
    if (!source || source.type !== "table" || !Array.isArray(source.children) || !source.children.length || source.children.length > MAX_ROWS) return null;
    const width = source.children[0]?.children?.length;
    if (!width || width > MAX_COLUMNS) return null;
    const table: WritingTable = { type: "table", children: [] };
    for (const row of source.children) {
      if (row?.type !== "tableRow" || !Array.isArray(row.children) || row.children.length !== width) return null;
      const cells: WritingTable["children"][number]["children"] = [];
      for (const cell of row.children) {
        const children = cell?.type === "tableCell" && inlineNodes(cell.children);
        if (!children) return null;
        cells.push({ type: "tableCell", children });
      }
      table.children.push({ type: "tableRow", children: cells });
    }
    if (Array.isArray(source.align) && source.align.length === width)
      table.align = source.align.map((align: unknown) => ["left", "center", "right"].includes(String(align)) ? align : null);
    const widths = tableColumnWidths(source);
    if (widths) setTableColumnWidths(table, widths.slice());
    return table;
  } catch { return null; }
}

export function tableClipboardText(table: WritingTable) {
  const text = (nodes: Inline[]): string => nodes.map(node => "value" in node ? node.value : node.type === "image" ? node.alt || "" : "children" in node ? text(node.children) : "\n").join("");
  const quote = (value: string) => /[\t\n\r"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return table.children.map(row => row.children.map(cell => quote(text(cell.children))).join("\t")).join("\n");
}

export function tableFromTsv(value: string): WritingTable | null {
  if (!value.includes("\t") || value.length > MAX_CLIPBOARD_LENGTH) return null;
  const rows: string[][] = [[]];
  let field = "", quoted = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === '"' && (quoted || !field)) {
      if (quoted && value[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && (character === "\t" || character === "\n" || character === "\r")) {
      rows.at(-1)!.push(field); field = "";
      if (character !== "\t") {
        if (character === "\r" && value[index + 1] === "\n") index++;
        rows.push([]);
      }
    } else field += character;
  }
  if (quoted) return null;
  rows.at(-1)!.push(field);
  if (rows.length > 1 && rows.at(-1)!.length === 1 && !rows.at(-1)![0]) rows.pop();
  const width = Math.max(...rows.map(row => row.length));
  if (rows.length > MAX_ROWS || width > MAX_COLUMNS) return null;
  return { type: "table", children: rows.map(row => ({ type: "tableRow", children: Array.from({ length: width }, (_, column) => ({ type: "tableCell", children: row[column] ? [{ type: "text", value: row[column] }] : [] })) })) };
}

export function tableFromHtml(value: string): WritingTable | null {
  if (!value || value.length > MAX_CLIPBOARD_LENGTH) return null;
  const element = new DOMParser().parseFromString(value, "text/html").querySelector("table");
  if (!element || element.querySelector("table")) return null;
  const metadata = element.getAttribute("data-fieldbook-table");
  if (metadata) {
    try {
      const table = decodeTableClipboard(decodeURIComponent(metadata));
      if (table) return table;
    } catch { /* Invalid metadata falls back to the ordinary HTML table. */ }
  }
  const contents = (node: Node): Inline[] => {
    if (node.nodeType === Node.TEXT_NODE) return [{ type: "text", value: node.textContent || "" }];
    if (!(node instanceof Element) || ["SCRIPT", "STYLE"].includes(node.tagName)) return [];
    const children = Array.from(node.childNodes).flatMap(contents);
    if (node.tagName === "BR") return [{ type: "break" }];
    if (["STRONG", "B"].includes(node.tagName)) return [{ type: "strong", children }];
    if (["EM", "I"].includes(node.tagName)) return [{ type: "emphasis", children }];
    if (["S", "DEL", "STRIKE"].includes(node.tagName)) return [{ type: "delete", children }];
    if (node.tagName === "CODE") return [{ type: "inlineCode", value: node.textContent || "" }];
    if (node.tagName === "A" && safeUrl(node.getAttribute("href"))) return [{ type: "link", url: safeUrl(node.getAttribute("href")), children }];
    if (node.tagName === "IMG" && safeUrl(node.getAttribute("src"))) return [{ type: "image", url: safeUrl(node.getAttribute("src")), alt: node.getAttribute("alt") || "" }];
    return children;
  };
  const rows = Array.from(element.rows);
  const width = rows[0]?.cells.length;
  if (!width || width > MAX_COLUMNS || rows.length > MAX_ROWS || rows.some(row => row.cells.length !== width || Array.from(row.cells).some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1))) return null;
  return { type: "table", children: rows.map(row => ({ type: "tableRow", children: Array.from(row.cells).map(cell => ({ type: "tableCell", children: contents(cell) })) })) };
}
