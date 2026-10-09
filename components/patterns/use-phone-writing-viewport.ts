"use client";

import { useLayoutEffect, type RefObject } from "react";
import { readWritingCaretLine } from "./writing-cursor";
import { touchWritingQuery } from "./use-editor-cards-layout";
import { compactLayoutQuery } from "./use-compact-layout";

/** Keep phone writing in page flow with one measured reserve below the dock. */
export function usePhoneWritingViewport(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    const editor = root?.closest<HTMLElement>(".editor");
    const owner = root?.closest<HTMLElement>(".main-content");
    const viewport = window.visualViewport;
    if (!root || !editor || !owner || !viewport) return;
    const phone = window.matchMedia(compactLayoutQuery);
    const touch = window.matchMedia(touchWritingQuery);
    let dragging = false;
    let moved = false;
    let manualGesture = false;
    let protecting = false;
    let caretNode: Node | null = null;
    let caretOffset = -1;
    let request = 0;
    let space = -1;
    let correctionsLeft = 0;
    let appliedScroll: number | null = null;
    let geometry: string | null = null;
    function clear() {
      owner!.style.removeProperty("--phone-writing-clearance");
    }
    function lineMargin() {
      const content = root!.querySelector<HTMLElement>(".writing-content") || root!;
      return parseFloat(getComputedStyle(content).lineHeight)
        || parseFloat(getComputedStyle(document.documentElement).fontSize);
    }
    function writingBottom(margin: number) {
      const bounds = owner!.getBoundingClientRect();
      const dock = editor!.closest(".app")?.querySelector<HTMLElement>('.editor-frame-controls[data-dock="true"]');
      return Math.min(bounds.bottom, viewport!.offsetTop + viewport!.height,
        dock?.getBoundingClientRect().top ?? Infinity) - margin;
    }
    function reserveSpace() {
      if (!phone.matches || !touch.matches || viewport!.scale !== 1) {
        space = -1;
        geometry = null;
        clear();
        return false;
      }
      // This is the complete obstruction reserve, including native browser
      // controls and the keyboard. Layout-height guesses can disagree with
      // the dock on phones whose clientHeight already shrank for the keyboard.
      const bounds = owner!.getBoundingClientRect();
      const bottom = writingBottom(lineMargin());
      const nextGeometry = [bounds.top, bounds.bottom, bottom, viewport!.offsetTop, viewport!.height]
        .map(Math.round).join(":");
      const changed = nextGeometry !== geometry;
      geometry = nextGeometry;
      const next = Math.max(0, Math.ceil(bounds.bottom - bottom));
      if (next === space) return changed;
      space = next;
      owner!.style.setProperty("--phone-writing-clearance", `${space}px`);
      return changed;
    }
    function revealCaret() {
      const active = document.activeElement;
      if (!protecting || dragging || !phone.matches || !touch.matches || viewport!.scale !== 1 || !(active instanceof HTMLElement) || !active.isContentEditable || !root!.contains(active)) return;
      const selection = window.getSelection();
      if (!selection?.rangeCount || !selection.isCollapsed || !root!.contains(selection.focusNode)) return;
      const element = selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode?.parentElement;
      if (!element?.closest('[contenteditable="true"]')) return;
      let caret = readWritingCaretLine(root) || selection.getRangeAt(0).getClientRects()[0];
      if (!caret?.height) {
        // A new Lexical paragraph is <p><br></p>: its collapsed range has no
        // text rectangle. Use only that empty line, never the whole canvas.
        const line = element.closest(".cm-line, p, li, h1, h2, h3, h4, blockquote, pre");
        if (!line || line.textContent?.trim()) return;
        caret = line.getBoundingClientRect();
      }
      if (!caret.height) return;
      const dock = editor!.closest(".app")?.querySelector<HTMLElement>('.editor-frame-controls[data-dock="true"]');
      if (dock && getComputedStyle(dock).visibility === "hidden") return;
      const bounds = owner!.getBoundingClientRect();
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const navigation = root!.closest(".editor-frame-canvas")?.querySelector(".editor-canvas-navigation")?.getBoundingClientRect().bottom || bounds.top;
      const heading = root!.querySelector(".writing-document-heading")?.getBoundingClientRect().bottom || bounds.top;
      const top = Math.max(bounds.top, viewport!.offsetTop, navigation, heading) + rem;
      // Protect the actual toolbar boundary, including native app panning,
      // rather than deriving its location from a viewport height difference.
      const bottom = writingBottom(lineMargin());
      if (bottom <= top) return;
      const delta = caret.bottom > bottom ? caret.bottom - bottom : caret.top < top ? caret.top - top : 0;
      if (Math.abs(delta) < 1 || correctionsLeft === 0) return;
      const next = Math.max(0, Math.min(owner!.scrollHeight - owner!.clientHeight, owner!.scrollTop + delta));
      const previous = owner!.scrollTop;
      if (Math.abs(next - previous) < 1) return;
      correctionsLeft -= 1;
      appliedScroll = next;
      owner!.scrollTo({ top: next, behavior: "instant" });
      // Check achieved positioning once after the browser/editor has rendered.
      // A correction's own scroll event cannot replenish this finite budget.
      if (Math.abs(owner!.scrollTop - previous) >= 1) schedule();
    }
    function cancelReveal() {
      cancelAnimationFrame(request);
      request = 0;
    }
    function schedule() {
      if (request || !protecting || dragging || !phone.matches || !touch.matches || viewport!.scale !== 1) return;
      // Input and a stream of keyboard resize events share one next-paint
      // correction. Later viewport events must never postpone an active edit.
      request = requestAnimationFrame(() => { request = 0; revealCaret(); });
    }
    function renewProtection() { protecting = true; correctionsLeft = 2; }
    function resize() {
      const changed = reserveSpace();
      if (changed && !manualGesture) { renewProtection(); schedule(); }
    }
    function pan() {
      const changed = reserveSpace();
      if (changed && !manualGesture) { renewProtection(); schedule(); }
    }
    // The frame has already placed the dock for this paint. Protect that
    // measured boundary immediately rather than waiting for another frame.
    function dockChanged() {
      const changed = reserveSpace();
      if (changed && !manualGesture) renewProtection();
      revealCaret();
    }
    function ownerScrolled() {
      if (appliedScroll !== null && Math.abs(owner!.scrollTop - appliedScroll) < 1) {
        appliedScroll = null;
        return;
      }
      appliedScroll = null;
      // Native/Lexical scrolls can move the caret after our input correction.
      // Scrolling only verifies the current edit; it never takes control back
      // from an intentional gesture or starts an unbounded chasing loop.
      schedule();
    }
    function editing(event?: Event) {
      // Focus and viewport movement own keyboard geometry. Text input is
      // followed by the rendered-text observer, without another layout read.
      if (event?.type !== "input") reserveSpace();
      const active = document.activeElement;
      protecting = active instanceof HTMLElement && active.isContentEditable && root!.contains(active);
      if (protecting) {
        manualGesture = false;
        renewProtection();
        schedule();
      }
      else cancelReveal();
    }
    function blur() { protecting = false; cancelReveal(); reserveSpace(); }
    function selectionMoved() {
      const selection = window.getSelection();
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.isContentEditable || !root!.contains(active) || !selection?.isCollapsed || !root!.contains(selection.focusNode)) {
        // A native selection can briefly disappear or expand while WebKit
        // updates it. Its return to the same caret must rearm protection.
        caretNode = null; caretOffset = -1;
        cancelReveal();
        return;
      }
      if (selection.focusNode === caretNode && selection.focusOffset === caretOffset) return;
      caretNode = selection.focusNode; caretOffset = selection.focusOffset;
      if (!manualGesture) { renewProtection(); schedule(); }
    }
    function startDrag() { dragging = true; moved = false; manualGesture = false; cancelReveal(); }
    function moveDrag() { moved = true; manualGesture = true; protecting = false; cancelReveal(); }
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      // A tap may place the same caret beside the floating dock. A scroll or
      // native selection drag keeps ownership through the following momentum.
      if (!moved) { renewProtection(); schedule(); }
    }
    function cancelDrag() { dragging = false; manualGesture = true; protecting = false; cancelReveal(); }
    function wheel() { manualGesture = true; protecting = false; cancelReveal(); }
    function navigateCaret(event: KeyboardEvent) {
      if (!/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|PageUp|PageDown)$/.test(event.key)) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.isContentEditable || !root!.contains(active)) return;
      manualGesture = false; renewProtection(); schedule();
    }
    const writing = new MutationObserver((records) => {
      if (!protecting || dragging || !phone.matches || !touch.matches || viewport!.scale !== 1 || !records.some(({ target }) => {
        const element = target instanceof Element ? target : target.parentElement;
        return !!element?.closest('[contenteditable="true"]');
      })) return;
      // Lexical may commit a wrapped row after the input handler's frame.
      // Observe the actual rendered text, without changing its selection.
      correctionsLeft = 2;
      revealCaret();
    });
    writing.observe(root, { childList: true, characterData: true, subtree: true });
    reserveSpace();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", pan);
    window.addEventListener("scroll", pan, { passive: true });
    phone.addEventListener("change", resize);
    touch.addEventListener("change", resize);
    editor.addEventListener("focusin", editing);
    editor.addEventListener("focusout", blur);
    root.addEventListener("input", editing);
    root.addEventListener("keydown", navigateCaret, true);
    document.addEventListener("selectionchange", selectionMoved);
    owner.addEventListener("fieldbook:editor-dock-change", dockChanged);
    owner.addEventListener("scroll", ownerScrolled, { passive: true });
    owner.addEventListener("wheel", wheel, { passive: true });
    owner.addEventListener("touchstart", startDrag, { passive: true });
    owner.addEventListener("touchmove", moveDrag, { passive: true });
    window.addEventListener("touchend", endDrag);
    window.addEventListener("touchcancel", cancelDrag);
    return () => {
      cancelReveal();
      writing.disconnect();
      clear();
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", pan);
      window.removeEventListener("scroll", pan);
      phone.removeEventListener("change", resize);
      touch.removeEventListener("change", resize);
      editor.removeEventListener("focusin", editing);
      editor.removeEventListener("focusout", blur);
      root.removeEventListener("input", editing);
      root.removeEventListener("keydown", navigateCaret, true);
      document.removeEventListener("selectionchange", selectionMoved);
      owner.removeEventListener("fieldbook:editor-dock-change", dockChanged);
      owner.removeEventListener("scroll", ownerScrolled);
      owner.removeEventListener("wheel", wheel);
      owner.removeEventListener("touchstart", startDrag);
      owner.removeEventListener("touchmove", moveDrag);
      window.removeEventListener("touchend", endDrag);
      window.removeEventListener("touchcancel", cancelDrag);
    };
  }, [ref]);
}
