"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCellValue, usePublisher } from "@mdxeditor/gurx";
import {
  $isTableNode,
  activeEditor$,
  NESTED_EDITOR_UPDATED_COMMAND,
  addComposerChild$,
  realmPlugin,
  rootEditor$,
  readOnly$,
} from "@mdxeditor/editor";
import {
  $getNodeByKey,
  $getRoot,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
} from "lexical";
import { MAX_SAVED_TABLE_COLUMN_WIDTH, MAX_TABLE_COLUMN_WIDTH, MIN_TABLE_COLUMN_WIDTH, moveTablePart, setTableColumnWidths, tableColumnWidths } from "@/lib/writing-table";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { WritingBlockActions, blockActions } from "./writing-block-actions";
import { useWritingInteraction } from "./writing-interaction";

type Axis = "row" | "column";
type Box = { left: number; top: number; width: number; height: number };
type Geometry = { rows: Box[]; columns: Box[]; grid: Box };
function position(element: HTMLElement | null, box: Partial<Box>) {
  if (element)
    for (const [property, value] of Object.entries(box))
      element.style.setProperty(property, `${value}px`);
}
type Drag = {
  axis: Axis;
  from: number;
  boundary: number;
  preview: string;
  left: number;
  top: number;
};

function previewText(host: HTMLElement, axis: Axis, index: number) {
  const rows = Array.from(host.querySelector("table")?.tBodies[0]?.rows || []);
  const cells = rows.map((row) =>
    Array.from(row.cells).filter((cell) => !cell.hasAttribute("data-tool-cell")),
  );
  const selected = axis === "row" ? cells[index] || [] : cells.map((row) => row[index]);
  return selected
    .map((cell) => cell?.textContent?.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");
}

function GutterActions({
  editor,
  host,
  align,
  children,
}: {
  editor: LexicalEditor;
  host: HTMLElement;
  align: "table" | "divider";
  children: ReactNode;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const frame = editor.getRootElement()?.parentElement;
  useLayoutEffect(() => {
    if (!frame) return;
    const table = align === "table" ? host.querySelector("table") : null;
    const measure = () => {
      const origin = frame.getBoundingClientRect();
      const bounds = host.getBoundingClientRect();
      const tableBounds = table?.getBoundingClientRect();
      position(anchor.current, {
        left: (tableBounds ? Math.max(tableBounds.left, bounds.left + 16) : bounds.left)
          - origin.left + frame.scrollLeft - 44,
        top: (tableBounds ? tableBounds.top + 4 : bounds.top + bounds.height / 2 - 18)
          - origin.top + frame.scrollTop,
      });
    };
    const show = () => setHovered(true);
    const hide = () => setHovered(false);
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(frame);
    resize.observe(host);
    if (table) resize.observe(table);
    let frameId = 0;
    const unregister = editor.registerUpdateListener(() => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(measure);
    });
    host.addEventListener("pointerenter", show);
    host.addEventListener("pointerleave", hide);
    host.addEventListener("focusin", show);
    host.addEventListener("focusout", hide);
    host.addEventListener("scroll", measure, { passive: true });
    document.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frameId);
      unregister();
      resize.disconnect();
      host.removeEventListener("pointerenter", show);
      host.removeEventListener("pointerleave", hide);
      host.removeEventListener("focusin", show);
      host.removeEventListener("focusout", hide);
      host.removeEventListener("scroll", measure);
      document.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [editor, host, align, frame]);
  if (!frame) return null;
  return createPortal(
    <span
      ref={anchor}
      className="writing-block-gutter-actions"
      data-hovered={hovered}
      contentEditable={false}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {children}
    </span>,
    frame,
  );
}

function TableControls({
  editor,
  nodeKey,
  host,
}: {
  editor: LexicalEditor;
  nodeKey: string;
  host: HTMLElement;
}) {
  const disabled = useCellValue(readOnly$);
  const active = useCellValue(activeEditor$);
  const activate = usePublisher(activeEditor$);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [menu, setMenu] = useState<{ axis: Axis; index: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pressed, setPressed] = useState<{ axis: Axis; index: number } | null>(null);
  const [resizing, setResizing] = useState<number | null>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  const [announcement, setAnnouncement] = useState("");
  const gesture = useRef<(() => void) | null>(null);
  const fadeRef = useRef<HTMLSpanElement>(null);
  const resizePreview = useRef(false);
  const refresh = useRef<() => void>(() => {});
  useWritingInteraction(!!menu || !!pressed || resizing !== null);
  useEffect(() => () => gesture.current?.(), []);
  useLayoutEffect(() => {
    if (disabled) return;
    const table = host.querySelector("table");
    if (!table) return;
    host.classList.add("writing-table-block");
    const updateFade = () => {
      const left = host.scrollLeft > 2;
      const right = host.scrollWidth - host.scrollLeft - host.clientWidth > 2;
      setFade((current) => current.left === left && current.right === right ? current : { left, right });
    };
    const measure = () => {
      if (!resizePreview.current) editor.getEditorState().read(() => {
        const widths = getTable()?.getMdastNode();
        const sized = widths && tableColumnWidths(widths);
        const columns = Array.from(table.querySelectorAll<HTMLTableColElement>("colgroup col")).slice(1, -1);
        const total = sized?.reduce((sum, width) => sum + width, 0);
        const tableWidth = total ? `${total}px` : "";
        if (table.style.width !== tableWidth) table.style.width = tableWidth;
        table.style.tableLayout = sized ? "fixed" : "";
        columns.forEach((column, index) => {
          const width = sized?.[index] ? `${sized[index]}px` : "";
          if (column.style.width !== width) column.style.width = width;
        });
      });
      const rows = Array.from(table.tBodies[0]?.rows || []);
      const cells = rows.map((row) =>
        Array.from(row.cells).filter(
          (cell) => !cell.hasAttribute("data-tool-cell"),
        ),
      );
      if (!cells[0]?.length) return;
      const origin = host.getBoundingClientRect();
      const box = (el: Element): Box => {
        const b = el.getBoundingClientRect();
        return {
          left: b.left - origin.left + host.scrollLeft,
          top: b.top - origin.top + host.scrollTop,
          width: b.width,
          height: b.height,
        };
      };
      const firstCell = cells[0][0];
      const lastCell = cells.at(-1)!.at(-1)!;
      const first = box(firstCell);
      const last = box(lastCell);
      const grid = {
        left: first.left,
        top: first.top,
        width: last.left + last.width - first.left,
        height: last.top + last.height - first.top,
      };
      const next = {
        grid,
        rows: cells.map((row) => ({ ...box(row[0]), width: grid.width })),
        columns: cells[0].map((cell) => ({
          ...box(cell),
          height: grid.height,
        })),
      };
      setGeometry((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      const frame = editor.getRootElement()?.parentElement;
      if (frame) {
        const origin = frame.getBoundingClientRect();
        const bounds = host.getBoundingClientRect();
        const top = firstCell.getBoundingClientRect().top;
        const bottom = lastCell.getBoundingClientRect().bottom;
        position(fadeRef.current, {
          left: bounds.left - origin.left + frame.scrollLeft,
          top: top - origin.top + frame.scrollTop,
          width: bounds.width,
          height: bottom - top,
        });
      }
      updateFade();
    };
    refresh.current = measure;
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(table);
    resize.observe(host);
    const mutation = new MutationObserver(measure);
    mutation.observe(table, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const unregister = editor.registerUpdateListener(measure);
    host.addEventListener("scroll", updateFade, { passive: true });
    return () => {
      unregister();
      host.removeEventListener("scroll", updateFade);
      refresh.current = () => {};
      resize.disconnect();
      mutation.disconnect();
      host.classList.remove("writing-table-block");
    };
  }, [host, disabled]);
  useLayoutEffect(() => { if (geometry) refresh.current(); }, [geometry]);
  function change(
    run: (node: NonNullable<ReturnType<typeof getTable>>) => void,
  ) {
    if (active && active !== editor)
      active.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined);
    activate(editor);
    editor.update(
      () => {
        const node = getTable();
        if (node) run(node);
      },
      { tag: HISTORY_PUSH_TAG },
    );
  }
  function getTable() {
    const node = $getNodeByKey(nodeKey);
    return $isTableNode(node) ? node : null;
  }
  function move(axis: Axis, from: number, to: number) {
    if (from === to) return;
    change((node) => {
      moveTablePart(node.getWritable().getMdastNode(), axis, from, to);
    });
    setAnnouncement(`Moved ${axis} ${from + 1} to position ${to + 1}.`);
  }
  function commitWidth(index: number, width: number, baseline?: number[]) {
    change((node) => {
      const table = node.getWritable().getMdastNode();
      const widths = tableColumnWidths(table)?.slice() || baseline || geometry?.columns.map((column) => Math.ceil(column.width)) || [];
      const maximum = Math.max(MAX_TABLE_COLUMN_WIDTH, Math.ceil(baseline?.[index] ?? geometry?.columns[index]?.width ?? MAX_TABLE_COLUMN_WIDTH));
      widths[index] = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.min(maximum, Math.round(width)));
      setTableColumnWidths(table, widths.map((value) => Math.max(MIN_TABLE_COLUMN_WIDTH, Math.min(MAX_SAVED_TABLE_COLUMN_WIDTH, value))));
    });
    setAnnouncement(`Column ${index + 1} width ${Math.round(width)} pixels.`);
  }
  function startResize(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (disabled || event.button !== 0 || !geometry) return;
    event.preventDefault();
    event.stopPropagation();
    gesture.current?.();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    // Auto-sized cells can be fractionally wide; rounding down rewraps untouched columns.
    const baseline = geometry.columns.map((column) => Math.ceil(column.width));
    const initial = baseline[index];
    const maximum = Math.max(MAX_TABLE_COLUMN_WIDTH, initial);
    let width = initial;
    resizePreview.current = true;
    setResizing(index);
    const preview = (next: number) => {
      const table = host.querySelector("table");
      const columns = Array.from(table?.querySelectorAll<HTMLTableColElement>("colgroup col") || []).slice(1, -1);
      if (!table || !columns[index]) return;
      columns.forEach((column, columnIndex) => {
        column.style.width = `${columnIndex === index ? next : baseline[columnIndex]}px`;
      });
      table.style.tableLayout = "fixed";
      table.style.width = `${baseline.reduce((sum, value) => sum + value, 0) - initial + next}px`;
      refresh.current();
    };
    const update = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      width = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.min(maximum, Math.round(initial + e.clientX - startX)));
      preview(width);
      setAnnouncement(`Column ${index + 1} width ${width} pixels. Escape cancels.`);
    };
    const finish = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      cleanup();
      if (width !== initial) commitWidth(index, width, baseline);
    };
    const cancel = (e?: PointerEvent) => {
      if (e && e.pointerId !== pointerId) return;
      cleanup();
      preview(initial);
      setAnnouncement("Resize cancelled.");
    };
    const blur = () => cancel();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } };
    const cleanup = () => {
      document.removeEventListener("pointermove", update);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
      setResizing(null);
      resizePreview.current = false;
      requestAnimationFrame(() => refresh.current());
      gesture.current = null;
    };
    gesture.current = cleanup;
    document.addEventListener("pointermove", update, { passive: false });
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
  }
  function start(
    event: React.PointerEvent<HTMLButtonElement>,
    axis: Axis,
    index: number,
  ) {
    if (disabled || event.button !== 0 || !geometry) return;
    event.preventDefault();
    gesture.current?.();
    setPressed({ axis, index });
    const pointerId = event.pointerId;
    const startX = event.clientX,
      startY = event.clientY;
    let dragging = false,
      boundary = index;
    const boxes = geometry[axis === "row" ? "rows" : "columns"];
    const preview = previewText(host, axis, index);
    const update = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (!(e.buttons & 1)) return cancel();
      if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < 6)
        return;
      dragging = true;
      setMenu(null);
      e.preventDefault();
      const bounds = host.getBoundingClientRect();
      const position =
        axis === "row"
          ? e.clientY - bounds.top + host.scrollTop
          : e.clientX - bounds.left + host.scrollLeft;
      boundary = boxes.findIndex(
        (b) =>
          position <
          (axis === "row" ? b.top + b.height / 2 : b.left + b.width / 2),
      );
      if (boundary < 0) boundary = boxes.length;
      setDrag({
        axis,
        from: index,
        boundary,
        preview,
        left: Math.max(8, Math.min(e.clientX + 16, window.innerWidth - 288)),
        top: Math.max(8, Math.min(e.clientY + 16, window.innerHeight - 52)),
      });
      setAnnouncement(
        `Moving ${axis} ${index + 1} to position ${(boundary > index ? boundary - 1 : boundary) + 1}. Escape cancels.`,
      );
      if (axis === "column") {
        if (e.clientX > bounds.right - 32) host.scrollLeft += 16;
        else if (e.clientX < bounds.left + 32) host.scrollLeft -= 16;
      }
    };
    const finish = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      cleanup();
      setDrag(null);
      if (dragging) {
        const bounds = host.getBoundingClientRect();
        if (
          e.clientX < bounds.left - 32 ||
          e.clientX > bounds.right + 32 ||
          e.clientY < bounds.top - 32 ||
          e.clientY > bounds.bottom + 32
        ) {
          setAnnouncement("Move cancelled.");
          return;
        }
        move(axis, index, boundary > index ? boundary - 1 : boundary);
      } else
        setMenu((current) =>
          current?.axis === axis && current.index === index
            ? null
            : { axis, index },
        );
    };
    const cancel = (e?: PointerEvent) => {
      if (e && e.pointerId !== pointerId) return;
      cleanup();
      setDrag(null);
      setAnnouncement("Move cancelled.");
    };
    const blur = () => cancel();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    const cleanup = () => {
      document.removeEventListener("pointermove", update);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
      setPressed(null);
      gesture.current = null;
    };
    gesture.current = cleanup;
    document.addEventListener("pointermove", update, { passive: false });
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
  }
  if (!geometry || disabled) return null;
  const fadeFrame = editor.getRootElement()?.parentElement;
  const { grid } = geometry;
  const source = drag
    ? geometry[drag.axis === "row" ? "rows" : "columns"][drag.from]
    : null;
  const boxes = drag ? geometry[drag.axis === "row" ? "rows" : "columns"] : [];
  const boundary = drag && (boxes[drag.boundary] || boxes.at(-1));
  return (
    <>
      {fadeFrame && createPortal(
        <span ref={fadeRef} className="table-edge-fade writing-table-edge-fade"
          data-more-left={fade.left} data-more-right={fade.right}
          contentEditable={false} aria-hidden="true" />,
        fadeFrame,
      )}
      <GutterActions editor={editor} host={host} align="table">
        <WritingBlockActions
          label="Table"
          {...blockActions(editor, nodeKey)}
          onRemove={() =>
            change((node) => {
              node.selectPrevious();
              node.remove();
            })
          }
        />
      </GutterActions>
      {(["row", "column"] as const).flatMap((axis) =>
        geometry[axis === "row" ? "rows" : "columns"].map(
          (box, index, items) => (
            <span
              key={`${axis}-${index}`}
              className={`writing-table-handle writing-table-${axis}`}
              ref={(element) =>
                position(element, {
                  left: axis === "row" ? grid.left : box.left + box.width / 2,
                  top: axis === "row" ? box.top + box.height / 2 : grid.top,
                })
              }
              contentEditable={false}
            >
              <DropdownMenu
                modal={false}
                open={menu?.axis === axis && menu.index === index}
                onOpenChange={(open) => setMenu(open ? { axis, index } : null)}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="writing-table-grip"
                    data-pressed={pressed?.axis === axis && pressed.index === index}
                    aria-label={`${axis === "row" ? "Row" : "Column"} ${index + 1} actions and drag handle`}
                    onPointerDown={(event) => start(event, axis, index)}
                  >
                    <span className="writing-table-grip-mark" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    disabled={index === 0}
                    onSelect={() => move(axis, index, index - 1)}
                  >
                    Move {axis} {axis === "row" ? "up" : "left"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index === items.length - 1}
                    onSelect={() => move(axis, index, index + 1)}
                  >
                    Move {axis} {axis === "row" ? "down" : "right"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      change((node) => {
                        if (axis === "row") node.insertRowAt(index);
                        else {
                          const widths = tableColumnWidths(node.getMdastNode())?.slice();
                          node.insertColumnAt(index);
                          if (widths) { widths.splice(index, 0, MIN_TABLE_COLUMN_WIDTH); setTableColumnWidths(node.getWritable().getMdastNode(), widths); }
                        }
                      })
                    }
                  >
                    Insert {axis} before
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      change((node) => {
                        if (axis === "row") node.insertRowAt(index + 1);
                        else {
                          const widths = tableColumnWidths(node.getMdastNode())?.slice();
                          node.insertColumnAt(index + 1);
                          if (widths) { widths.splice(index + 1, 0, MIN_TABLE_COLUMN_WIDTH); setTableColumnWidths(node.getWritable().getMdastNode(), widths); }
                        }
                      })
                    }
                  >
                    Insert {axis} after
                  </DropdownMenuItem>
                  {axis === "column" &&
                    (["left", "center", "right"] as const).map((align) => (
                      <DropdownMenuItem
                        key={align}
                        onSelect={() =>
                          change((node) => node.setColumnAlign(index, align))
                        }
                      >
                        Align {align}
                      </DropdownMenuItem>
                    ))}
                  <DropdownMenuItem
                    onSelect={() =>
                      change((node) => {
                        if (axis === "row") node.deleteRowAt(index);
                        else if (node.getColCount() === 1) {
                          node.selectPrevious();
                          node.remove();
                        } else {
                          const widths = tableColumnWidths(node.getMdastNode())?.slice();
                          node.deleteColumnAt(index);
                          if (widths) { widths.splice(index, 1); setTableColumnWidths(node.getWritable().getMdastNode(), widths); }
                          node
                            .getWritable()
                            .getMdastNode()
                            .align?.splice(index, 1);
                        }
                      })
                    }
                  >
                    Remove {axis}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          ),
        ),
      )}
      {geometry.columns.map((box, index) => (
        <Button
          key={`resize-${index}`}
          type="button"
          variant="ghost"
          size="icon"
          className="writing-table-resizer"
          data-resizing={resizing === index}
          contentEditable={false}
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize column ${index + 1}`}
          aria-valuemin={MIN_TABLE_COLUMN_WIDTH}
          aria-valuemax={Math.max(MAX_TABLE_COLUMN_WIDTH, Math.ceil(box.width))}
          aria-valuenow={Math.max(MIN_TABLE_COLUMN_WIDTH, Math.ceil(box.width))}
          title={`Resize column ${index + 1}; use arrow keys for 16 pixel steps`}
          ref={(element) => position(element, { left: box.left + box.width, top: grid.top + box.height / 2 })}
          onPointerDown={(event) => startResize(event, index)}
          onKeyDown={(event) => {
            const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
            if (!direction && event.key !== "Home" && event.key !== "End") return;
            event.preventDefault();
            const current = Math.ceil(box.width);
            const next = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.min(Math.max(MAX_TABLE_COLUMN_WIDTH, current),
              event.key === "Home" ? MIN_TABLE_COLUMN_WIDTH : event.key === "End" ? MAX_TABLE_COLUMN_WIDTH : current + direction * 16));
            if (next !== current) commitWidth(index, next);
          }}
        ><span aria-hidden="true" /></Button>
      ))}
      {source && (
        <span
          className="writing-table-drag-source"
          ref={(element) => position(element, source)}
          contentEditable={false}
        />
      )}
      {drag && boundary && (
        <span
          className={`writing-table-drop writing-table-drop-${drag.axis}`}
          ref={(element) =>
            position(
              element,
              drag.axis === "row"
                ? {
                    left: grid.left,
                    top:
                      boundary.top +
                      (drag.boundary === boxes.length ? boundary.height : 0),
                    width: grid.width,
                  }
                : {
                    left:
                      boundary.left +
                      (drag.boundary === boxes.length ? boundary.width : 0),
                    top: grid.top,
                    height: grid.height,
                  },
            )
          }
          contentEditable={false}
        />
      )}
      {(pressed || resizing !== null) &&
        createPortal(
          <span className="writing-table-drag-shield" aria-hidden="true" />,
          document.body,
        )}
      {drag &&
        createPortal(
          <span
            className="writing-table-drag-preview"
            ref={(element) => position(element, { left: drag.left, top: drag.top })}
            aria-hidden="true"
          >
            <strong>{drag.axis === "row" ? "Row" : "Column"} {drag.from + 1}</strong>
            {drag.preview && <span>{drag.preview}</span>}
          </span>,
          document.body,
        )}
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        contentEditable={false}
      >
        {announcement}
      </span>
    </>
  );
}

function DividerControls({
  editor,
  nodeKey,
  host,
}: {
  editor: LexicalEditor;
  nodeKey: string;
  host: HTMLElement;
}) {
  const disabled = useCellValue(readOnly$);
  if (disabled) return null;
  return (
    <GutterActions editor={editor} host={host} align="divider">
      <WritingBlockActions label="Divider" {...blockActions(editor, nodeKey)} />
    </GutterActions>
  );
}

function WritingTableControls({ initialWidths, onRootEditor, onWidthsChange }: { initialWidths: (number[] | null)[]; onRootEditor: (editor: LexicalEditor | null) => void; onWidthsChange: (widths: (number[] | null)[]) => void }) {
  const editor = useCellValue(rootEditor$);
  const initialized = useRef(false);
  const [tables, setTables] = useState<
    { key: string; host: HTMLElement; divider: boolean }[]
  >([]);
  useEffect(() => { onRootEditor(editor); return () => onRootEditor(null); }, [editor, onRootEditor]);
  useEffect(() => {
    if (!editor) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        editor.getEditorState().read(() => {
          if (!initialized.current && initialWidths.length) {
            const nodes = $getRoot().getChildren().filter($isTableNode);
            if (nodes.length) {
              initialized.current = true;
              editor.update(() => {
                $getRoot().getChildren().filter($isTableNode).forEach((node, index) => {
                  const widths = initialWidths[index];
                  if (widths?.length === node.getColCount()) setTableColumnWidths(node.getWritable().getMdastNode(), widths);
                });
              }, { tag: HISTORY_MERGE_TAG });
              return;
            }
          }
          const tableNodes = $getRoot().getChildren().filter($isTableNode);
          onWidthsChange(tableNodes.map((node) => tableColumnWidths(node.getMdastNode())?.slice() || null));
          const next = $getRoot()
            .getChildren()
            .filter(
              (node) =>
                $isTableNode(node) || node.getType() === "horizontalrule",
            )
            .flatMap((node) => {
              const host = editor.getElementByKey(node.getKey());
              return host
                ? [
                    {
                      key: node.getKey(),
                      host,
                      divider: node.getType() === "horizontalrule",
                    },
                  ]
                : [];
            });
          setTables((previous) =>
            previous.length === next.length &&
            previous.every(
              (item, i) =>
                item.key === next[i].key && item.host === next[i].host,
            )
              ? previous
              : next,
          );
        }),
      );
    };
    update();
    const unregister = editor.registerUpdateListener(update);
    return () => {
      unregister();
      cancelAnimationFrame(frame);
    };
  }, [editor, initialWidths, onWidthsChange]);
  return editor
    ? tables.map(({ key, host, divider }) =>
        createPortal(
          divider ? (
            <DividerControls editor={editor} nodeKey={key} host={host} />
          ) : (
            <TableControls editor={editor} nodeKey={key} host={host} />
          ),
          divider ? editor.getRootElement()!.parentElement! : host,
          key,
        ),
      )
    : null;
}
export const writingTableControlsPlugin = (initialWidths: (number[] | null)[], onRootEditor: (editor: LexicalEditor | null) => void, onWidthsChange: (widths: (number[] | null)[]) => void) => realmPlugin({
  init(realm) {
    realm.pub(addComposerChild$, () => <WritingTableControls initialWidths={initialWidths} onRootEditor={onRootEditor} onWidthsChange={onWidthsChange} />);
  },
});
