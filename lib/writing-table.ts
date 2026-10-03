import type { TableNode } from "@mdxeditor/editor";

type Table = ReturnType<TableNode["getMdastNode"]>;

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
    if (table.align) {
      table.align = Array.from(
        { length: count },
        (_, index) => table.align?.[index] ?? null,
      );
      move(table.align);
    }
  }
}
