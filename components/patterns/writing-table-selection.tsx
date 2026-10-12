"use client";

import { useEffect, useState } from "react";
import { useCellValues, usePublisher } from "@mdxeditor/gurx";
import {
  $createTableNode, $isTableNode, activeEditor$, exportLexicalTreeToMdast,
  exportVisitors$, jsxComponentDescriptors$, jsxIsAvailable$,
  NESTED_EDITOR_UPDATED_COMMAND, readOnly$, rootEditor$,
} from "@mdxeditor/editor";
import {
  $createRangeSelection, $getNearestNodeFromDOMNode, $getNodeByKey, $getRoot, $getSelection,
  $isRangeSelection, $setSelection, getNearestEditorFromDOMNode,
  HISTORY_PUSH_TAG, SKIP_SCROLL_INTO_VIEW_TAG,
} from "lexical";
import {
  cellRectangle, clearTableCells, decodeTableClipboard, pasteTableCells, selectedTable,
  TABLE_CLIPBOARD_TYPE, tableClipboardText, tableFromHtml, tableFromTsv,
  type CellPoint, type CellRectangle, type WritingTable,
} from "@/lib/writing-table-selection";
import { useWritingInteraction } from "./writing-interaction";
import { normalizeWritingSelection } from "./writing-selection-boundaries";

type TableTarget = { key: string; host: HTMLElement; table: HTMLTableElement };
type TableSelection = TableTarget & { anchor: CellPoint; focus: CellPoint };
type NativePoint = { node: Node; offset: number };

function tableCells(table: HTMLTableElement) {
  return Array.from(table.tBodies[0]?.rows || []).map(row =>
    Array.from(row.cells).filter(cell => !cell.hasAttribute("data-tool-cell")),
  );
}

function caretAt(document: Document, x: number, y: number): NativePoint | null {
  const owner = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = owner.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = owner.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/** One selection/clipboard owner bridges the table's independent cell editors. */
export function WritingTableSelection() {
  const [editor, disabled, visitors, descriptors, jsx] = useCellValues(
    rootEditor$, readOnly$, exportVisitors$, jsxComponentDescriptors$, jsxIsAvailable$,
  );
  const activate = usePublisher(activeEditor$);
  const [announcement, setAnnouncement] = useState("");
  const [interacting, setInteracting] = useState(false);
  useWritingInteraction(interacting);

  useEffect(() => {
    const root = editor?.getRootElement();
    if (!editor || !root || disabled) return;
    const document = root.ownerDocument;
    let selection: TableSelection | null = null;
    let gesture: { target: TableTarget; anchor: CellPoint; native: NativePoint | null; pointer: number; crossed: boolean } | null = null;
    let suppressClick = false, scrollFrame = 0, updateFrame = 0, focusFrame = 0;
    let pointer = { x: 0, y: 0 };

    const targetFor = (element: Element | null): TableTarget | null => {
      const host = element?.closest<HTMLElement>('[data-lexical-decorator="true"]:has(table)');
      const table = host?.querySelector<HTMLTableElement>("table");
      if (!host || !table || !root.contains(host)) return null;
      return editor.read("latest", () => {
        const node = $getNearestNodeFromDOMNode(host);
        return $isTableNode(node) ? { key: node.getKey(), host, table } : null;
      });
    };
    const cellFor = (element: Element | null) => {
      const cell = element?.closest<HTMLTableCellElement>("td, th");
      const target = targetFor(cell || null);
      if (!target || !cell || cell.hasAttribute("data-tool-cell")) return null;
      const rows = tableCells(target.table);
      const row = rows.findIndex(cells => cells.includes(cell));
      return row < 0 ? null : { target, point: { row, column: rows[row].indexOf(cell) } };
    };
    const paint = () => {
      root.querySelectorAll("[data-writing-cell-selected]").forEach(cell => cell.removeAttribute("data-writing-cell-selected"));
      root.querySelectorAll("[data-table-cell-selection]").forEach(host => host.removeAttribute("data-table-cell-selection"));
      if (!selection) return;
      const rectangle = cellRectangle(selection.anchor, selection.focus);
      const cells = tableCells(selection.table);
      selection.host.setAttribute("data-table-cell-selection", "true");
      for (let row = rectangle.top; row <= rectangle.bottom; row++)
        for (let column = rectangle.left; column <= rectangle.right; column++)
          cells[row]?.[column]?.setAttribute("data-writing-cell-selected", "true");
    };
    const select = (next: TableSelection | null) => {
      selection = next;
      paint();
      setInteracting(!!next);
      if (next) {
        const rectangle = cellRectangle(next.anchor, next.focus);
        const count = (rectangle.bottom - rectangle.top + 1) * (rectangle.right - rectangle.left + 1);
        setAnnouncement(`${count} table cells selected. Copy, cut, or paste. Escape returns to editing.`);
        const nested = getNearestEditorFromDOMNode(document.activeElement);
        if (nested && nested !== editor)
          nested.update(() => $setSelection(null), { discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG });
        document.getSelection()?.removeAllRanges();
      } else setAnnouncement("");
      document.dispatchEvent(new Event("fieldbook-table-selection-change"));
    };
    const focusCell = (target: TableTarget, point: CellPoint) => {
      cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => editor.update(() => {
        const node = $getNodeByKey(target.key);
        if ($isTableNode(node)) node.select([point.column, point.row]);
      }, { tag: SKIP_SCROLL_INTO_VIEW_TAG }));
    };
    const flush = () => {
      const nested = getNearestEditorFromDOMNode(document.activeElement);
      if (nested && nested !== editor) nested.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined);
    };
    const change = (target: TableTarget, run: (table: WritingTable) => void) => {
      flush();
      root.focus({ preventScroll: true });
      activate(editor);
      editor.update(() => {
        const node = $getNodeByKey(target.key);
        if ($isTableNode(node)) run(node.getWritable().getMdastNode());
        $setSelection(null);
      }, { discrete: true, tag: [HISTORY_PUSH_TAG, SKIP_SCROLL_INTO_VIEW_TAG] });
    };
    const snapshot = (target: TableTarget) => {
      const table = editor.getEditorState().read(() => {
        const node = $getNodeByKey(target.key);
        return $isTableNode(node) ? structuredClone(node.getMdastNode()) : null;
      });
      if (!table) return null;
      // Read live nested editors as well as the parent: cell edits commit on blur.
      tableCells(target.table).forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
        const nested = getNearestEditorFromDOMNode(cell.querySelector('[contenteditable="true"]'));
        if (!nested || nested === editor) return;
        nested.getEditorState().read(() => {
          const mdast = exportLexicalTreeToMdast({ root: $getRoot(), visitors, jsxComponentDescriptors: descriptors, jsxIsAvailable: jsx });
          const paragraph = mdast.children[0];
          if (paragraph?.type === "paragraph" && table.children[rowIndex]?.children[columnIndex])
            table.children[rowIndex].children[columnIndex].children = structuredClone(paragraph.children);
        });
      }));
      return table;
    };
    const pointAt = (target: TableTarget, x: number, y: number): CellPoint | null => {
      const rows = tableCells(target.table);
      if (!rows[0]?.length) return null;
      let row = rows.findIndex(cells => y < cells[0].getBoundingClientRect().bottom);
      if (row < 0) row = rows.length - 1;
      let column = rows[row].findIndex(cell => x < cell.getBoundingClientRect().right);
      if (column < 0) column = rows[row].length - 1;
      return { row, column };
    };
    const updateDrag = () => {
      if (!gesture) return;
      const { target, anchor } = gesture;
      const point = pointAt(target, pointer.x, pointer.y);
      if (!point) return;
      const multiple = point.row !== anchor.row || point.column !== anchor.column;
      if (multiple) {
        if (!gesture.crossed) {
          const native = document.getSelection();
          if (native?.anchorNode) gesture.native = { node: native.anchorNode, offset: native.anchorOffset };
          gesture.crossed = true;
        }
        if (!selection || selection.focus.row !== point.row || selection.focus.column !== point.column)
          select({ ...target, anchor, focus: point });
      } else if (selection) {
        select(null);
        const native = gesture.native, focus = caretAt(document, pointer.x, pointer.y);
        if (native?.node.isConnected && focus)
          document.getSelection()?.setBaseAndExtent(native.node, native.offset, focus.node, focus.offset);
      }
    };
    const scroll = () => {
      if (!gesture || !selection) return;
      const host = gesture.target.host, bounds = host.getBoundingClientRect();
      if (pointer.x > bounds.right - 24) host.scrollLeft += 12;
      else if (pointer.x < bounds.left + 24) host.scrollLeft -= 12;
      const viewport = root.closest<HTMLElement>(".writing-scroll-area");
      const visible = viewport?.getBoundingClientRect();
      if (viewport && visible && viewport.scrollHeight > viewport.clientHeight) {
        if (pointer.y > visible.bottom - 24) viewport.scrollTop += 12;
        else if (pointer.y < visible.top + 24) viewport.scrollTop -= 12;
      }
      updateDrag();
      scrollFrame = requestAnimationFrame(scroll);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      suppressClick = false;
      cancelAnimationFrame(focusFrame);
      gesture = null; cancelAnimationFrame(scrollFrame); scrollFrame = 0;
      if (event.pointerType === "touch") { select(null); return; }
      const element = event.target instanceof Element ? event.target : null;
      const cell = cellFor(element);
      if (element?.closest("button, [role=menu]")) { select(null); return; }
      if (!cell) { select(null); return; }
      if (event.shiftKey && selection?.key === cell.target.key) {
        event.preventDefault(); event.stopPropagation();
        select({ ...selection, focus: cell.point });
        return;
      }
      select(null);
      gesture = { target: cell.target, anchor: cell.point, native: caretAt(document, event.clientX, event.clientY), pointer: event.pointerId, crossed: false };
    };
    const move = (event: PointerEvent) => {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      if (!(event.buttons & 1)) { finish(event); return; }
      pointer = { x: event.clientX, y: event.clientY };
      updateDrag();
      if (selection) {
        event.preventDefault(); event.stopPropagation();
        if (!scrollFrame) scrollFrame = requestAnimationFrame(scroll);
      }
    };
    const finish = (event: PointerEvent) => {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      suppressClick = gesture.crossed;
      gesture = null;
      cancelAnimationFrame(scrollFrame); scrollFrame = 0;
      if (selection) { event.preventDefault(); event.stopPropagation(); }
    };
    const cancel = () => {
      gesture = null; cancelAnimationFrame(scrollFrame); scrollFrame = 0;
      select(null);
    };
    const click = (event: MouseEvent) => {
      if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
    };
    const nativeSelection = () => {
      if (selection && document.getSelection()?.rangeCount) document.getSelection()?.removeAllRanges();
    };
    const copy = (event: ClipboardEvent) => {
      if (!selection || !event.clipboardData) return;
      const table = snapshot(selection);
      if (!table) return;
      const rectangle = cellRectangle(selection.anchor, selection.focus);
      const slice = selectedTable(table, rectangle);
      const html = document.createElement("table");
      const rows = tableCells(selection.table);
      for (let row = rectangle.top; row <= rectangle.bottom; row++) {
        const tr = html.insertRow();
        for (let column = rectangle.left; column <= rectangle.right; column++) {
          const clone = rows[row][column].cloneNode(true) as HTMLTableCellElement;
          [clone, ...Array.from(clone.querySelectorAll("*"))].forEach(element => {
            Array.from(element.attributes).forEach(attribute => {
              if (["contenteditable", "class", "tabindex", "role"].includes(attribute.name) || attribute.name.startsWith("data-") || attribute.name.startsWith("aria-")) element.removeAttribute(attribute.name);
            });
          });
          tr.append(clone);
        }
      }
      event.clipboardData.setData(TABLE_CLIPBOARD_TYPE, JSON.stringify({ version: 1, table: slice }));
      event.clipboardData.setData("text/plain", tableClipboardText(slice));
      event.clipboardData.setData("text/html", html.outerHTML);
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.type === "cut") change(selection, table => clearTableCells(table, rectangle));
    };
    const paste = (event: ClipboardEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const surface = element?.closest('[contenteditable="true"]');
      if (!surface || !root.contains(surface) || !event.clipboardData || event.clipboardData.files.length) return;
      const data = event.clipboardData;
      const incoming = decodeTableClipboard(data.getData(TABLE_CLIPBOARD_TYPE)) || tableFromHtml(data.getData("text/html")) || tableFromTsv(data.getData("text/plain"));
      const cell = cellFor(element);
      if (selection || cell) {
        const target = selection || cell!.target;
        const rectangle = selection ? cellRectangle(selection.anchor, selection.focus) : cellRectangle(cell!.point, cell!.point);
        const source = incoming || (selection ? { type: "table" as const, children: [{ type: "tableRow" as const, children: [{ type: "tableCell" as const, children: [{ type: "text" as const, value: data.getData("text/plain") }] }] }] } : null);
        if (!source) return;
        const current = snapshot(target);
        const pasted = current && pasteTableCells(current, source, rectangle);
        if (!pasted) return;
        event.preventDefault(); event.stopImmediatePropagation();
        change(target, table => { pasteTableCells(table, source, rectangle); });
        select({ ...target, anchor: { row: pasted.top, column: pasted.left }, focus: { row: pasted.bottom, column: pasted.right } });
      } else if (incoming && surface === root) {
        const dom = document.getSelection();
        const native = dom?.rangeCount ? dom.getRangeAt(0).cloneRange() : null;
        const editableAt = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest('[contenteditable="true"]');
        const ownsNative = native && editableAt(native.startContainer) === root && editableAt(native.endContainer) === root;
        const hasRange = editor.getEditorState().read(() => $isRangeSelection($getSelection()));
        if (!ownsNative && !hasRange) return;
        event.preventDefault(); event.stopImmediatePropagation();
        editor.update(() => {
          let range = $getSelection();
          if (ownsNative) {
            const current = $createRangeSelection();
            current.applyDOMRange(native);
            $setSelection(current);
            range = current;
          }
          if ($isRangeSelection(range)) normalizeWritingSelection(range);
          if ($isRangeSelection(range)) range.insertNodes([$createTableNode(incoming)]);
        }, { discrete: true, tag: [HISTORY_PUSH_TAG, SKIP_SCROLL_INTO_VIEW_TAG] });
      }
    };
    const key = (event: KeyboardEvent) => {
      if (!selection || event.isComposing) return;
      const current = selection;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); select(null); focusCell(current, current.anchor);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault(); event.stopPropagation();
        const cells = tableCells(current.table);
        select({ ...current, anchor: { row: 0, column: 0 }, focus: { row: cells.length - 1, column: cells[0].length - 1 } });
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault(); event.stopPropagation();
        if (event.shiftKey) {
          const cells = tableCells(current.table), focus = { ...current.focus };
          if (event.key === "ArrowUp") focus.row--;
          if (event.key === "ArrowDown") focus.row++;
          if (event.key === "ArrowLeft") focus.column--;
          if (event.key === "ArrowRight") focus.column++;
          focus.row = Math.max(0, Math.min(cells.length - 1, focus.row));
          focus.column = Math.max(0, Math.min(cells[0].length - 1, focus.column));
          select({ ...current, focus });
        } else { select(null); focusCell(current, current.focus); }
      } else if (event.key === "Backspace" || event.key === "Delete" || (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)) {
        event.preventDefault(); event.stopPropagation();
        const rectangle = cellRectangle(current.anchor, current.focus);
        change(current, table => {
          clearTableCells(table, rectangle);
          if (event.key.length === 1) table.children[rectangle.top].children[rectangle.left].children = [{ type: "text", value: event.key }];
        });
        select(null); focusCell(current, { row: rectangle.top, column: rectangle.left });
      } else if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault(); event.stopPropagation(); select(null); focusCell(current, current.anchor);
      }
    };
    const selectTable = (event: Event) => {
      const target = targetFor(event.target instanceof Element ? event.target : null);
      if (!target) return;
      flush(); root.focus({ preventScroll: true }); activate(editor);
      const cells = tableCells(target.table);
      if (cells[0]?.length) select({ ...target, anchor: { row: 0, column: 0 }, focus: { row: cells.length - 1, column: cells[0].length - 1 } });
    };
    const unregister = editor.registerUpdateListener(() => {
      cancelAnimationFrame(updateFrame);
      updateFrame = requestAnimationFrame(() => {
        if (selection && !selection.host.isConnected) select(null);
        else paint();
      });
    });
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, { capture: true, passive: false });
    document.addEventListener("pointerup", finish, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("keydown", key, true);
    document.addEventListener("selectionchange", nativeSelection);
    root.addEventListener("click", click, true);
    root.addEventListener("copy", copy, true);
    root.addEventListener("cut", copy, true);
    root.addEventListener("paste", paste, true);
    root.addEventListener("fieldbook-select-table", selectTable);
    window.addEventListener("blur", cancel);
    return () => {
      unregister(); cancel(); cancelAnimationFrame(updateFrame); cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", finish, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("selectionchange", nativeSelection);
      root.removeEventListener("click", click, true);
      root.removeEventListener("copy", copy, true);
      root.removeEventListener("cut", copy, true);
      root.removeEventListener("paste", paste, true);
      root.removeEventListener("fieldbook-select-table", selectTable);
      window.removeEventListener("blur", cancel);
    };
  }, [editor, disabled, visitors, descriptors, jsx, activate]);

  return <span className="sr-only" role="status">{announcement}</span>;
}
