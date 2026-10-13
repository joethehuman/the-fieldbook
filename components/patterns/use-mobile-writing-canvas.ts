"use client";

import { useLayoutEffect, type RefObject } from "react";
import { readWritingCaretLine } from "./writing-cursor";
import { touchWritingQuery } from "./use-editor-cards-layout";
import { compactLayoutQuery } from "./use-compact-layout";

/** Native editing owns ordinary scrolling. An explicit return reveals its saved target. */
export function useMobileWritingCanvas(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    const owner = root?.closest<HTMLElement>(".main-content");
    if (!root || !owner || !root.closest(".editor")) return;
    const compact = window.matchMedia(compactLayoutQuery);
    const touch = window.matchMedia(touchWritingQuery);
    let request = 0;
    type ReturnSelection = { anchor: Node; anchorOffset: number; focus: Node; focusOffset: number };
    let target: { surface: HTMLElement; selection: ReturnSelection | null } | null = null;
    const resize = new ResizeObserver(schedule);
    function cancel() {
      cancelAnimationFrame(request);
      request = 0;
      target = null;
      resize.disconnect();
    }
    function schedule() {
      if (target && !request) request = requestAnimationFrame(reveal);
    }
    function readSelection(selection: Selection | null): ReturnSelection | null {
      if (!selection?.rangeCount || !selection.anchorNode || !selection.focusNode
        || !root!.contains(selection.anchorNode) || !root!.contains(selection.focusNode)) return null;
      return { anchor: selection.anchorNode, anchorOffset: selection.anchorOffset,
        focus: selection.focusNode, focusOffset: selection.focusOffset };
    }
    function reveal() {
      request = 0;
      const selection = window.getSelection();
      // A return owns only its captured selection, never subsequent editing or
      // a new native target. Keyboard motion may finish after the first paint.
      if (!target || document.activeElement !== target.surface || !target.surface.isConnected
        || window.visualViewport && window.visualViewport.scale !== 1) {
        cancel();
        return;
      }
      const current = readSelection(selection);
      // A return can precede the editor's first committed native selection.
      // An absent range is never a target; wait for a committed resize/read.
      if (!current || !selection) return;
      if (!target.selection) target.selection = current;
      const saved = target.selection;
      if (current.anchor !== saved.anchor || current.anchorOffset !== saved.anchorOffset
        || current.focus !== saved.focus || current.focusOffset !== saved.focusOffset) {
        cancel();
        return;
      }
      let caret = readWritingCaretLine(root, true);
      // CodeMirror owns its editing model and internal scrollport. Reveal only
      // its native focus edge in the outer canvas during the same return.
      if (!caret && selection.rangeCount) {
        const range = selection.getRangeAt(0).cloneRange();
        range.setStart(saved.focus, saved.focusOffset);
        range.collapse(true);
        caret = Array.from(range.getClientRects()).find(rect => rect.height > 0) || null;
      }
      if (!caret) return;
      const bounds = owner!.getBoundingClientRect();
      const top = bounds.top + 8;
      const bottom = bounds.bottom - 8;
      if (bottom - top < caret.height) return;
      const delta = caret.bottom > bottom ? caret.bottom - bottom : caret.top < top ? caret.top - top : 0;
      if (Math.abs(delta) >= 1) owner!.scrollBy({ top: delta, behavior: "instant" });
    }
    const update = () => {
      root.toggleAttribute("data-mobile-canvas", compact.matches && touch.matches);
      if (!root.hasAttribute("data-mobile-canvas")) cancel();
    };
    const resume = () => {
      cancel();
      const surface = document.activeElement;
      const selection = window.getSelection();
      if (!root.hasAttribute("data-mobile-canvas") || window.visualViewport && window.visualViewport.scale !== 1
        || !(surface instanceof HTMLElement) || !surface.isContentEditable || !root.contains(surface)) return;
      target = { surface, selection: readSelection(selection) };
      // Only this navigation transaction observes the physical scrollport.
      // The next user action ends it, without guessing keyboard timing.
      resize.observe(owner);
      schedule();
    };
    update();
    compact.addEventListener("change", update);
    touch.addEventListener("change", update);
    root.addEventListener("fieldbook:writing-resume", resume);
    root.addEventListener("fieldbook:writing-handoff", cancel);
    root.addEventListener("focusout", cancel);
    root.addEventListener("beforeinput", cancel, true);
    root.addEventListener("input", cancel, true);
    // Cancel the previous return before React can create one for this gesture.
    window.addEventListener("keydown", cancel, true);
    window.addEventListener("pointerdown", cancel, { passive: true, capture: true });
    window.addEventListener("touchstart", cancel, { passive: true, capture: true });
    window.addEventListener("wheel", cancel, { passive: true, capture: true });
    return () => {
      cancel();
      root.removeAttribute("data-mobile-canvas");
      compact.removeEventListener("change", update);
      touch.removeEventListener("change", update);
      root.removeEventListener("fieldbook:writing-resume", resume);
      root.removeEventListener("fieldbook:writing-handoff", cancel);
      root.removeEventListener("focusout", cancel);
      root.removeEventListener("beforeinput", cancel, true);
      root.removeEventListener("input", cancel, true);
      window.removeEventListener("keydown", cancel, true);
      window.removeEventListener("pointerdown", cancel, true);
      window.removeEventListener("touchstart", cancel, true);
      window.removeEventListener("wheel", cancel, true);
    };
  }, [ref]);
}
