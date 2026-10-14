"use client";

import { readWritingCaretLine } from "./writing-cursor";

export type FocusBox = { top: number; bottom: number };
const readers = new WeakMap<HTMLElement, () => FocusBox | null>();

/** Model editors register a read-only focus edge without adding their bundle to the frame. */
export function registerEditingFocusReader(surface: HTMLElement, reader: () => FocusBox | null) {
  readers.set(surface, reader);
  return () => { if (readers.get(surface) === reader) readers.delete(surface); };
}

export function editableAt(node: Node | null): HTMLElement | null {
  return (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('[contenteditable="true"]') || null;
}

function fieldLine(field: HTMLTextAreaElement | HTMLInputElement): FocusBox {
  const bounds = field.getBoundingClientRect();
  const style = getComputedStyle(field);
  const mirror = document.createElement("div");
  for (const property of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "lineHeight", "letterSpacing", "textIndent", "textTransform", "textAlign", "direction", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const) mirror.style[property] = style[property];
  Object.assign(mirror.style, {
    position: "fixed", top: "0", left: "0", width: `${field.clientWidth}px`, height: "0",
    boxSizing: "border-box", visibility: "hidden", overflow: "hidden", pointerEvents: "none",
    whiteSpace: field instanceof HTMLInputElement ? "pre" : "pre-wrap", overflowWrap: "break-word",
  });
  mirror.setAttribute("aria-hidden", "true");
  mirror.inert = true;
  const offset = field.selectionDirection === "backward" ? field.selectionStart : field.selectionEnd;
  mirror.append(document.createTextNode(field.value.slice(0, offset ?? 0)));
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.append(marker, document.createTextNode(field.value.slice(offset ?? 0)));
  document.body.append(mirror);
  const measured = marker.getBoundingClientRect();
  const rawTop = bounds.top + (parseFloat(style.borderTopWidth) || 0) + measured.top - mirror.getBoundingClientRect().top - field.scrollTop;
  const height = measured.height || parseFloat(style.lineHeight) || parseFloat(style.fontSize);
  mirror.remove();
  // Internal field scrolling stays native. Reveal its painted focus edge, never
  // an unpainted mirror line beyond the control's own scrollport.
  const top = Math.max(bounds.top, Math.min(bounds.bottom - height, rawTop));
  return { top, bottom: Math.min(bounds.bottom, top + height) };
}

/** Read the actual focus surface; a parent prose root must reject nested code ranges. */
export function readEditingFocus(surface: HTMLElement, available: number): FocusBox | null {
  if (document.activeElement !== surface || !surface.isConnected) return null;
  if (surface instanceof HTMLInputElement || surface instanceof HTMLTextAreaElement) {
    const bounds = surface.getBoundingClientRect();
    if (bounds.height <= available) return bounds;
    return fieldLine(surface);
  }
  const reader = readers.get(surface);
  if (reader) return reader();
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.focusNode) return null;
  const range = selection.getRangeAt(0).cloneRange();
  if (editableAt(range.startContainer) !== surface || editableAt(range.endContainer) !== surface) return null;
  return readWritingCaretLine(surface, true);
}
