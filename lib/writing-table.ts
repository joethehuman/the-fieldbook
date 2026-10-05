import type { TableNode } from "@mdxeditor/editor";

type Table = ReturnType<TableNode["getMdastNode"]>;
type SizedTable = Table & { data?: { fieldbookWidths?: number[] } };

export const MIN_TABLE_COLUMN_WIDTH = 144;
export const MAX_TABLE_COLUMN_WIDTH = 640;

export function tableColumnWidths(table: Table): number[] | undefined {
  const widths = (table as SizedTable).data?.fieldbookWidths;
  return widths?.length === table.children[0]?.children.length &&
    widths.every((width) => Number.isInteger(width) && width >= MIN_TABLE_COLUMN_WIDTH && width <= MAX_TABLE_COLUMN_WIDTH)
    ? widths
    : undefined;
}

export function setTableColumnWidths(table: Table, widths: number[] | undefined) {
  const sized = table as SizedTable;
  sized.data = { ...sized.data, fieldbookWidths: widths };
}

const WIDTHS_MARKER = /^<!-- fieldbook-table-widths:v1 (\[[^\n]*\]) -->\n\n/;

/** Widths are optional Markdown metadata; ordinary GFM readers still see a plain table. */
export function readTableWidths(markdown: string) {
  const marker = markdown.match(WIDTHS_MARKER);
  if (!marker) return { markdown, widths: [] as (number[] | null)[] };
  try {
    const value: unknown = JSON.parse(marker[1]);
    if (!Array.isArray(value) || value.length > 100 ||
      !value.every((entry) => entry === null ||
        (Array.isArray(entry) && entry.length <= 100 && entry.every((width) =>
          Number.isInteger(width) && width >= MIN_TABLE_COLUMN_WIDTH && width <= MAX_TABLE_COLUMN_WIDTH))))
      throw new Error("Invalid table widths");
    return { markdown: markdown.slice(marker[0].length), widths: value as (number[] | null)[] };
  } catch {
    return { markdown, widths: [] as (number[] | null)[] };
  }
}

export function writeTableWidths(markdown: string, widths: (number[] | null)[]) {
  const clean = readTableWidths(markdown).markdown;
  if (!widths.some(Boolean)) return clean;
  return `<!-- fieldbook-table-widths:v1 ${JSON.stringify(widths)} -->\n\n${clean}`;
}

/** Move complete cells (including formatting) and keep column alignment attached. */
export function moveTablePart(
  table: Table,
  axis: "row" | "column",
  from: number,
  to: number,
) {
  const count =
    axis === "row"
      ? table.children.length
      : table.children[0]?.children.length || 0;
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= count ||
    to >= count ||
    from === to
  )
    return;
  const move = <T>(items: T[]) => {
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item);
  };
  if (axis === "row") move(table.children);
  else {
    table.children.forEach((row) => move(row.children));
    const widths = tableColumnWidths(table);
    if (widths) move(widths);
    if (table.align) {
      table.align = Array.from(
        { length: count },
        (_, index) => table.align?.[index] ?? null,
      );
      move(table.align);
    }
  }
}
