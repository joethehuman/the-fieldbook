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
