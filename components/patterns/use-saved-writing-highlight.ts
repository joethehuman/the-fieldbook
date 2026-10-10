"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

const highlightName = "fieldbook-writing-target";

type SavedPaint = {
  range: Range;
  collection: Highlight;
  start: Node;
  startOffset: number;
  end: Node;
  endOffset: number;
  text: string;
};

/** Paint the saved prose target without restoring native selection or focus. */
export function useSavedWritingHighlight(ref: RefObject<HTMLElement | null>, enabled: boolean, active: boolean) {
  const paint = useRef<SavedPaint | null>(null);
  const clear = useCallback(() => {
    const saved = paint.current;
    paint.current = null;
    if (!saved) return;
    saved.collection.delete(saved.range);
    // Other mounted writers can own ranges in this same named collection.
    if (!saved.collection.size && typeof CSS !== "undefined" && CSS.highlights?.get(highlightName) === saved.collection) {
      CSS.highlights.delete(highlightName);
    }
  }, []);
  const capture = useCallback((providedRange?: Range) => {
    const root = ref.current;
    if (!enabled || !root || typeof Highlight !== "function" || typeof CSS === "undefined" || !CSS.highlights) return false;
    let range: Range;
    if (providedRange) range = providedRange.cloneRange();
    else {
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return false;
      const active = document.activeElement;
      const prose = active instanceof HTMLElement && active.isContentEditable && root.contains(active);
      const touchSelection = active === document.body;
      const dock = active instanceof HTMLButtonElement && !!active.closest('.editor-frame-controls[data-dock="true"]');
      if (!prose && !touchSelection && !dock) return false;
      range = selection.getRangeAt(0).cloneRange();
    }
    if (range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return false;
    clear();
    const collection = CSS.highlights.get(highlightName) || new Highlight();
    collection.add(range);
    CSS.highlights.set(highlightName, collection);
    paint.current = {
      range, collection, start: range.startContainer, startOffset: range.startOffset,
      end: range.endContainer, endOffset: range.endOffset, text: range.toString(),
    };
    return true;
  }, [ref, enabled, clear]);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!enabled || !root) { clear(); return; }
    const handoff = (event: Event) => {
      const range = event instanceof CustomEvent && event.detail instanceof Range ? event.detail : undefined;
      capture(range);
    };
    root.addEventListener("fieldbook:writing-handoff", handoff);
    root.addEventListener("fieldbook:writing-resume", clear);
    return () => {
      root.removeEventListener("fieldbook:writing-handoff", handoff);
      root.removeEventListener("fieldbook:writing-resume", clear);
      clear();
    };
  }, [ref, enabled, capture, clear]);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!active || !root) { clear(); return; }
    const changes = new MutationObserver(() => {
      const saved = paint.current;
      if (!saved) return;
      // A live Range silently retargets during node removal or replacement.
      // Keep only the original connected boundary points and selected text.
      if (!saved.start.isConnected || !saved.end.isConnected || !root.contains(saved.start) || !root.contains(saved.end)
        || saved.range.startContainer !== saved.start || saved.range.startOffset !== saved.startOffset
        || saved.range.endContainer !== saved.end || saved.range.endOffset !== saved.endOffset
        || saved.range.toString() !== saved.text) clear();
    });
    changes.observe(root, { childList: true, characterData: true, subtree: true });
    return () => { changes.disconnect(); clear(); };
  }, [ref, active, clear]);
  return { capture, clear };
}
