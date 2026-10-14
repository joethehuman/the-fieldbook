export const MIN_TABLE_COLUMN_WIDTH = 144;
export const MAX_TABLE_COLUMN_WIDTH = 640;
// An untouched auto-sized column can exceed the resize control's 640px limit.
// Keep that measured width when another column is resized, within a layout-safe bound.
export const MAX_SAVED_TABLE_COLUMN_WIDTH = 16384;

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
          Number.isInteger(width) && width >= MIN_TABLE_COLUMN_WIDTH && width <= MAX_SAVED_TABLE_COLUMN_WIDTH))))
      throw new Error("Invalid table widths");
    return { markdown: markdown.slice(marker[0].length), widths: value as (number[] | null)[] };
  } catch {
    return { markdown, widths: [] as (number[] | null)[] };
  }
}

type MarkdownNode = {
  type: string;
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, unknown> };
};

/** v1 width entries index only top-level tables, matching the visual editor. */
export function remarkTopLevelTableIndices() {
  return (tree: MarkdownNode) => {
    let index = 0;
    for (const node of tree.children || []) {
      if (node.type !== "table") continue;
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, "data-fieldbook-table-index": index++ },
      };
    }
  };
}

export function writeTableWidths(markdown: string, widths: (number[] | null)[]) {
  const clean = readTableWidths(markdown).markdown;
  if (!widths.some(Boolean)) return clean;
  return `<!-- fieldbook-table-widths:v1 ${JSON.stringify(widths)} -->\n\n${clean}`;
}
