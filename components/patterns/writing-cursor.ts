"use client";

export type WritingCursor =
  | { kind: "field"; surface: HTMLTextAreaElement | HTMLInputElement; value: string; start: number; end: number; direction: "forward" | "backward" | "none" }
  | { kind: "prose"; surface: HTMLElement; value: string; start: Node; startOffset: number; end: Node; endOffset: number; backward: boolean };

/** Keep static nodes: a live Range can silently retarget after a lesson changes. */
export function captureWritingCursor(canvas: HTMLElement | null): WritingCursor | null {
  const active = document.activeElement;
  if (!canvas) return null;
  if ((active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) && canvas.contains(active) && active.selectionStart !== null && active.selectionEnd !== null) {
    return { kind: "field", surface: active, value: active.value, start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection || "none" };
  }
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const node = selection.getRangeAt(0).startContainer;
  const surface = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('[contenteditable="true"]');
  if (!surface || !canvas.contains(surface)) return null;
  if (!(active instanceof HTMLElement && surface.contains(active) && active.isContentEditable)
    && !(active === document.body && !selection.isCollapsed)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  if (!surface.contains(range.endContainer)) {
    const contents = document.createRange(); contents.selectNodeContents(surface);
    if (range.compareBoundaryPoints(Range.END_TO_END, contents) > 0) range.setEnd(contents.endContainer, contents.endOffset);
  }
  if (!surface.contains(range.startContainer) || !surface.contains(range.endContainer)) return null;
  return { kind: "prose", surface, value: surface.textContent || "", start: range.startContainer, startOffset: range.startOffset, end: range.endContainer, endOffset: range.endOffset, backward: selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset };
}

export function blurWritingInput() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && (active.isContentEditable || active.matches("input, textarea"))) active.blur();
}

/** Call within the closing user gesture so mobile browsers can reopen input. */
export function restoreWritingCursor(cursor: WritingCursor | null) {
  if (!cursor?.surface.isConnected) return false;
  if (cursor.kind === "field") {
    if (cursor.surface.value !== cursor.value) return false;
    cursor.surface.focus({ preventScroll: true });
    cursor.surface.setSelectionRange(cursor.start, cursor.end, cursor.direction);
    return true;
  }
  if (cursor.surface.textContent !== cursor.value || !cursor.start.isConnected || !cursor.end.isConnected
    || !cursor.surface.contains(cursor.start) || !cursor.surface.contains(cursor.end)) return false;
  const range = document.createRange();
  try { range.setStart(cursor.start, cursor.startOffset); range.setEnd(cursor.end, cursor.endOffset); }
  catch { return false; }
  cursor.surface.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  if (cursor.backward) selection.setBaseAndExtent(cursor.end, cursor.endOffset, cursor.start, cursor.startOffset);
  return true;
}

/** Read one rendered prose line without changing the native or editor selection. */
export function readWritingCaretLine(canvas: HTMLElement | null): DOMRect | null {
  const active = document.activeElement;
  const selection = window.getSelection();
  if (!canvas || !(active instanceof HTMLElement) || !active.isContentEditable
    || !canvas.contains(active) || active.closest(".writing-code-block")
    || !selection?.isCollapsed || !selection.rangeCount || !canvas.contains(selection.focusNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  const rect = Array.from(range.getClientRects()).find((rect) => rect.height > 0);
  if (rect) return rect;
  // WebKit can omit a collapsed text rectangle. A neighboring character still
  // identifies the wrapped line, unlike the whole paragraph's bounding box.
  let text: Text | null = range.startContainer instanceof Text ? range.startContainer : null;
  let offset = range.startOffset;
  if (!text && range.startContainer instanceof Element) {
    const next = range.startContainer.childNodes[offset];
    const child = next || range.startContainer.childNodes[offset - 1];
    if (child instanceof Text) text = child;
    else if (child) {
      const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
      text = walker.nextNode() as Text | null;
      if (!next) { let last: Node | null; while ((last = walker.nextNode())) text = last as Text; }
    }
    offset = next ? 0 : text?.length || 0;
  }
  if (text?.length) {
    const start = Math.min(offset, text.length - 1);
    range.setStart(text, start); range.setEnd(text, start + 1);
    return Array.from(range.getClientRects()).find((rect) => rect.height > 0) || null;
  }
  const node = selection.focusNode;
  const block = (node instanceof Element ? node : node?.parentElement)?.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote");
  if (block && !block.textContent?.trim() && !block.querySelector('img, video, iframe, [data-lexical-decorator="true"]')) {
    const rect = block.getBoundingClientRect();
    return rect.height ? rect : null;
  }
  return null;
}
