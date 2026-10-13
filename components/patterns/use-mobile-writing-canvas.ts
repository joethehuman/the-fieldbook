"use client";

import { useLayoutEffect, type RefObject } from "react";
import { readWritingCaretLine } from "./writing-cursor";
import { touchWritingQuery } from "./use-editor-cards-layout";
import { compactLayoutQuery } from "./use-compact-layout";

/** Native editing owns ordinary scrolling; bounded returns and shrinking canvases reveal one saved target. */
export function useMobileWritingCanvas(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    const owner = root?.closest<HTMLElement>(".main-content");
    const app = root?.closest<HTMLElement>(".app");
    if (!root || !owner || !app || !root.closest(".editor")) return;
    const compact = window.matchMedia(compactLayoutQuery);
    const touch = window.matchMedia(touchWritingQuery);
    let request = 0;
    type ReturnSelection = { anchor: Node; anchorOffset: number; focus: Node; focusOffset: number };
    let target: { surface: HTMLElement; selection: ReturnSelection | null; kind: "return" | "resize"; width: number; scroll: number } | null = null;
    let manualScroll = false;
    let pointer: { id: number; x: number; y: number } | null = null;
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
      const resizing = target?.kind === "resize";
      try {
        const selection = window.getSelection();
        // A return owns only its captured selection, never subsequent editing or
        // a new native target. Keyboard motion may finish after the first paint.
        if (!target || document.activeElement !== target.surface || !target.surface.isConnected
          || window.visualViewport && window.visualViewport.scale !== 1
          || resizing && (manualScroll || Math.abs(owner!.clientWidth - target.width) >= 1 || owner!.scrollTop !== target.scroll)) {
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
      } finally {
        // A resize owns one completed layout read, including an absent caret or
        // a band too small to reveal it. It never becomes a caret follower.
        if (resizing) cancel();
      }
    }
    const update = () => {
      root.toggleAttribute("data-mobile-canvas", compact.matches && touch.matches);
      if (!root.hasAttribute("data-mobile-canvas")) cancel();
    };
    const resume = () => {
      cancel();
      manualScroll = false;
      const surface = document.activeElement;
      const selection = window.getSelection();
      if (!root.hasAttribute("data-mobile-canvas") || window.visualViewport && window.visualViewport.scale !== 1
        || !(surface instanceof HTMLElement) || !surface.isContentEditable || !root.contains(surface)) return;
      target = { surface, selection: readSelection(selection), kind: "return", width: owner.clientWidth, scroll: owner.scrollTop };
      // Only this navigation transaction observes the physical scrollport.
      // The next user action ends it, without guessing keyboard timing.
      resize.observe(owner);
      schedule();
    };
    const shrink = () => {
      // Preserve an explicit return or an already captured shrink across a burst
      // of viewport reports. The queued reveal validates focus and points again.
      if (target) { schedule(); return; }
      const surface = document.activeElement;
      const selection = window.getSelection();
      if (manualScroll || !root.hasAttribute("data-mobile-canvas") || !selection?.isCollapsed
        || !(surface instanceof HTMLElement) || !surface.isContentEditable || !root.contains(surface)) return;
      const saved = readSelection(selection);
      const caret = readWritingCaretLine(root);
      const bounds = owner.getBoundingClientRect();
      // A caret hidden by an intentional scroll must not pull its canvas back.
      if (!saved || !caret || caret.top < bounds.top - 1 || caret.bottom > bounds.bottom + 1) return;
      target = { surface, selection: saved, kind: "resize", width: owner.clientWidth, scroll: owner.scrollTop };
      schedule();
    };
    const edit = () => { manualScroll = false; cancel(); };
    const key = (event: KeyboardEvent) => {
      cancel();
      if (event.target instanceof Node && root.contains(event.target)) manualScroll = false;
    };
    const start = (event: PointerEvent) => {
      cancel();
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      // A focus tap can open the keyboard before pointerup. It resumes editing;
      // actual movement below gives scroll/selection gestures control instead.
      if (event.target instanceof Element && root.contains(event.target)
        && event.target.closest('[contenteditable="true"]')) manualScroll = false;
    };
    const manual = () => { manualScroll = true; cancel(); };
    const move = (event: PointerEvent) => {
      if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) manual();
    };
    const end = () => { pointer = null; };
    const scrolled = () => {
      // A delayed event from our previous reveal must not cancel a newer shrink
      // captured at that same position. Subsequent native/manual scrolling wins.
      if (target?.kind === "resize" && owner.scrollTop !== target.scroll) cancel();
    };
    update();
    compact.addEventListener("change", update);
    touch.addEventListener("change", update);
    root.addEventListener("fieldbook:writing-resume", resume);
    root.addEventListener("fieldbook:writing-handoff", cancel);
    root.addEventListener("focusout", cancel);
    root.addEventListener("focusin", edit);
    root.addEventListener("beforeinput", edit, true);
    root.addEventListener("input", edit, true);
    app.addEventListener("fieldbook:writing-viewport-shrink", shrink);
    owner.addEventListener("scroll", scrolled, { passive: true });
    // Cancel the previous return before React can create one for this gesture.
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", start, { passive: true, capture: true });
    window.addEventListener("pointermove", move, { passive: true, capture: true });
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    window.addEventListener("touchstart", cancel, { passive: true, capture: true });
    window.addEventListener("touchmove", manual, { passive: true, capture: true });
    window.addEventListener("wheel", manual, { passive: true, capture: true });
    return () => {
      cancel();
      root.removeAttribute("data-mobile-canvas");
      compact.removeEventListener("change", update);
      touch.removeEventListener("change", update);
      root.removeEventListener("fieldbook:writing-resume", resume);
      root.removeEventListener("fieldbook:writing-handoff", cancel);
      root.removeEventListener("focusout", cancel);
      root.removeEventListener("focusin", edit);
      root.removeEventListener("beforeinput", edit, true);
      root.removeEventListener("input", edit, true);
      app.removeEventListener("fieldbook:writing-viewport-shrink", shrink);
      owner.removeEventListener("scroll", scrolled);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", start, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      window.removeEventListener("touchstart", cancel, true);
      window.removeEventListener("touchmove", manual, true);
      window.removeEventListener("wheel", manual, true);
    };
  }, [ref]);
}
