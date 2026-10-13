"use client";

import { useLayoutEffect, type RefObject } from "react";
import { readWritingCaretLine } from "./writing-cursor";
import { touchWritingQuery } from "./use-editor-cards-layout";
import { compactLayoutQuery } from "./use-compact-layout";
import { mobileEditorLayout, mobileViewportQuietTime } from "./mobile-editor-layout";

/** Protect the measured phone writing band without taking over native gestures. */
export function usePhoneWritingViewport(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    const editor = root?.closest<HTMLElement>(".editor");
    const owner = root?.closest<HTMLElement>(".main-content");
    const viewport = window.visualViewport;
    if (!root || !editor || !owner || !viewport) return;
    const layout = mobileEditorLayout(owner);
    const phone = window.matchMedia(compactLayoutQuery);
    const touch = window.matchMedia(touchWritingQuery);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dragging = false;
    let moved = false;
    let manualGesture = false;
    let awaitingCaret = false;
    let protecting = false;
    let returningSelection = false;
    let caretNode: Node | null = null;
    let caretOffset = -1;
    let pendingReveal = false;
    let immediateReveal = false;
    let deferredViewport = false;
    let smoothScroll: { from: number; target: number; startedAt: number; viewport: string | undefined } | null = null;
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
      return Math.min(bounds.bottom, layout.band?.bottom ?? bounds.bottom) - margin;
    }
    function reserveSpace() {
      const managed = phone.matches && touch.matches && viewport!.scale === 1 && !!layout.band;
      root!.toggleAttribute("data-mobile-caret-owner", managed);
      if (!managed || !layout.band) {
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
      // Translation moves the shell and caret together. Only a changed usable
      // band may grant another check; browser panning never acquires ownership.
      const usableTop = layout.band.top;
      const nextGeometry = [bounds.height, bounds.width, bottom - bounds.top, usableTop - bounds.top]
        .map(Math.round).join(":");
      const changed = nextGeometry !== geometry;
      geometry = nextGeometry;
      const next = Math.max(0, Math.ceil(bounds.bottom - bottom));
      if (next === space) return changed;
      space = next;
      owner!.style.setProperty("--phone-writing-clearance", `${space}px`);
      return changed;
    }
    function cancelSmoothScroll() {
      if (!smoothScroll) return;
      smoothScroll = null;
      appliedScroll = null;
    }
    function advanceSmoothScroll() {
      if (!smoothScroll) return;
      const progress = Math.min(1, (performance.now() - smoothScroll.startedAt) / 180);
      const eased = progress * progress * (3 - 2 * progress);
      const next = smoothScroll.from + (smoothScroll.target - smoothScroll.from) * eased;
      owner!.scrollTo({ top: next, behavior: "instant" });
      if (progress < 1) layout.schedule("caret");
      else {
        appliedScroll = smoothScroll.target;
        smoothScroll = null;
        schedule();
      }
    }
    function revealCaret(smooth = false) {
      const active = document.activeElement;
      if (!protecting || dragging || !phone.matches || !touch.matches || viewport!.scale !== 1 || !(active instanceof HTMLElement) || !active.isContentEditable || !root!.contains(active)) return;
      const selection = window.getSelection();
      if (!selection?.rangeCount || !root!.contains(selection.focusNode)
        || !selection.isCollapsed && !returningSelection) return;
      const element = selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode?.parentElement;
      if (!element?.closest('[contenteditable="true"]')) return;
      let caret = readWritingCaretLine(root, returningSelection)
        || (selection.isCollapsed ? selection.getRangeAt(0).getClientRects()[0] : undefined);
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
      const rawTop = Math.max(bounds.top, layout.band?.top ?? bounds.top);
      // Protect the actual toolbar boundary, including native app panning,
      // rather than deriving its location from a viewport height difference.
      const bottom = writingBottom(lineMargin());
      const available = bottom - rawTop;
      if (available < caret.height - 1) return;
      // Larger formatted glyphs can fit in the writing band while the extra
      // top comfort margin cannot. Compress only that optional margin rather
      // than alternate between incompatible top and dock corrections.
      const top = rawTop + Math.min(rem, Math.max(0, available - caret.height));
      const delta = caret.bottom > bottom ? caret.bottom - bottom : caret.top < top ? caret.top - top : 0;
      if (Math.abs(delta) < 1 || correctionsLeft === 0) return;
      const next = Math.max(0, Math.min(owner!.scrollHeight - owner!.clientHeight, owner!.scrollTop + delta));
      const previous = owner!.scrollTop;
      if (Math.abs(next - previous) < 1) return;
      correctionsLeft -= 1;
      if (smooth && !reducedMotion.matches) {
        // One fixed-target animation runs in the caret phase. Native smooth
        // scrolling can apply a queued compositor delta after a user cancels it.
        smoothScroll = { from: previous, target: next, startedAt: performance.now(), viewport: layout.viewport?.signature };
        layout.schedule("caret");
        return;
      }
      appliedScroll = next;
      owner!.scrollTo({ top: next, behavior: "instant" });
      // Check achieved positioning once after the browser/editor has rendered.
      // A correction's own scroll event cannot replenish this finite budget.
      if (Math.abs(owner!.scrollTop - previous) >= 1) schedule();
    }
    function cancelReveal() {
      pendingReveal = false;
      immediateReveal = false;
      deferredViewport = false;
      cancelSmoothScroll();
    }
    function schedule() {
      if (!protecting || dragging || !phone.matches || !touch.matches || viewport!.scale !== 1) return;
      pendingReveal = true;
      layout.schedule("caret");
    }
    function renewProtection() { awaitingCaret = false; protecting = true; correctionsLeft = 2; }
    function measure() {
      const changed = reserveSpace();
      if (!root!.hasAttribute("data-mobile-caret-owner")) { cancelReveal(); return; }
      const interrupted = !!smoothScroll && (changed || smoothScroll.viewport !== layout.viewport?.signature);
      if (interrupted) cancelSmoothScroll();
      if ((changed || interrupted) && protecting && !manualGesture && !awaitingCaret) {
        correctionsLeft = Math.max(correctionsLeft, 1);
        pendingReveal = true;
      }
      if (smoothScroll) { advanceSmoothScroll(); return; }
      if (!pendingReveal) return;
      // The browser is already moving focus into view during keyboard motion.
      // Keep the reserve current, then make one correction to the settled band
      // instead of adding an instant canvas scroll to every animation sample.
      if (!immediateReveal && layout.viewport && performance.now() - layout.viewport.changedAt < mobileViewportQuietTime) {
        deferredViewport = true;
        return;
      }
      const smooth = deferredViewport && !immediateReveal;
      deferredViewport = false;
      pendingReveal = false;
      revealCaret(smooth);
      // Preserve an edit's second bounded check if its first correction moved.
      immediateReveal &&= pendingReveal;
    }
    const resize = () => layout.schedule("viewport");
    function ownerScrolled() {
      if (smoothScroll) return;
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
      cancelSmoothScroll();
      deferredViewport = false;
      immediateReveal = event?.type === "beforeinput" || event?.type === "input";
      returningSelection = false;
      // Native focus can precede the caret chosen by a touch tap. Input itself
      // is an explicit edit and may resume protection without a caret change.
      if (event?.type === "focusin" && (dragging || awaitingCaret)) return;
      const active = document.activeElement;
      protecting = active instanceof HTMLElement && active.isContentEditable && root!.contains(active);
      if (protecting) {
        manualGesture = false;
        renewProtection();
        schedule();
      }
      else cancelReveal();
    }
    function blur() { returningSelection = false; protecting = false; cancelReveal(); layout.schedule("caret"); }
    function resumeWriting() {
      cancelSmoothScroll();
      deferredViewport = false;
      const active = document.activeElement;
      const selection = window.getSelection();
      if (!(active instanceof HTMLElement) || !active.isContentEditable || !root!.contains(active)
        || !selection?.rangeCount || !root!.contains(selection.focusNode) || !root!.contains(selection.anchorNode)) return;
      returningSelection = !selection.isCollapsed;
      immediateReveal = true;
      manualGesture = false;
      renewProtection(); schedule();
    }
    function selectionMoved() {
      if (dragging) return;
      const selection = window.getSelection();
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.isContentEditable || !root!.contains(active)
        || !selection?.rangeCount || !selection.isCollapsed && !returningSelection || !root!.contains(selection.focusNode)) {
        // A native selection can briefly disappear or expand while WebKit
        // updates it. Its return to the same caret must rearm protection.
        // A transient missing range must not make the pre-tap caret look new.
        if (!awaitingCaret) { caretNode = null; caretOffset = -1; }
        cancelReveal();
        return;
      }
      if (selection.focusNode === caretNode && selection.focusOffset === caretOffset) return;
      cancelSmoothScroll();
      deferredViewport = false;
      caretNode = selection.focusNode; caretOffset = selection.focusOffset;
      if (awaitingCaret) manualGesture = false;
      if (!manualGesture) { renewProtection(); schedule(); }
    }
    function startDrag() {
      const selection = window.getSelection();
      caretNode = selection?.focusNode || null; caretOffset = selection?.focusOffset ?? -1;
      returningSelection = false; dragging = true; moved = false; awaitingCaret = false;
      manualGesture = true; protecting = false; correctionsLeft = 0; appliedScroll = null;
      cancelReveal();
    }
    function moveDrag() { moved = true; manualGesture = true; protecting = false; cancelReveal(); }
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      // touchend is not a selection commit: iOS can still report the old caret
      // for later paints. Wait for a changed native target, including one that
      // already arrived during the gesture, rather than revealing the old row.
      awaitingCaret = !moved;
      if (awaitingCaret) selectionMoved();
    }
    function cancelDrag() { awaitingCaret = false; dragging = false; manualGesture = true; protecting = false; cancelReveal(); }
    function wheel() { awaitingCaret = false; returningSelection = false; manualGesture = true; protecting = false; cancelReveal(); }
    function navigateCaret(event: KeyboardEvent) {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.isContentEditable || !root!.contains(active)) return;
      cancelSmoothScroll();
      deferredViewport = false;
      if (!/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|PageUp|PageDown)$/.test(event.key)) return;
      returningSelection = false;
      immediateReveal = true;
      manualGesture = false; renewProtection(); schedule();
    }
    const writing = new MutationObserver((records) => {
      if (!protecting || dragging || !phone.matches || !touch.matches || viewport!.scale !== 1 || !records.some(({ target }) => {
        const element = target instanceof Element ? target : target.parentElement;
        return !!element?.closest('[contenteditable="true"]');
      })) return;
      // Lexical may commit a wrapped row after the input handler's frame.
      // Observe the actual rendered text, without changing its selection.
      schedule();
    });
    writing.observe(root, { childList: true, characterData: true, subtree: true });
    const unsubscribe = layout.subscribe("caret", measure);
    phone.addEventListener("change", resize);
    touch.addEventListener("change", resize);
    editor.addEventListener("focusin", editing);
    editor.addEventListener("focusout", blur);
    root.addEventListener("beforeinput", editing, true);
    root.addEventListener("input", editing);
    root.addEventListener("fieldbook:writing-resume", resumeWriting);
    root.addEventListener("fieldbook:writing-handoff", cancelReveal);
    root.addEventListener("keydown", navigateCaret, true);
    document.addEventListener("selectionchange", selectionMoved);
    owner.addEventListener("scroll", ownerScrolled, { passive: true });
    owner.addEventListener("pointerdown", cancelSmoothScroll, { passive: true });
    owner.addEventListener("wheel", wheel, { passive: true });
    owner.addEventListener("touchstart", startDrag, { passive: true });
    owner.addEventListener("touchmove", moveDrag, { passive: true });
    window.addEventListener("touchend", endDrag);
    window.addEventListener("touchcancel", cancelDrag);
    return () => {
      cancelReveal();
      writing.disconnect();
      clear();
      unsubscribe();
      root.removeAttribute("data-mobile-caret-owner");
      phone.removeEventListener("change", resize);
      touch.removeEventListener("change", resize);
      editor.removeEventListener("focusin", editing);
      editor.removeEventListener("focusout", blur);
      root.removeEventListener("beforeinput", editing, true);
      root.removeEventListener("input", editing);
      root.removeEventListener("fieldbook:writing-resume", resumeWriting);
      root.removeEventListener("fieldbook:writing-handoff", cancelReveal);
      root.removeEventListener("keydown", navigateCaret, true);
      document.removeEventListener("selectionchange", selectionMoved);
      owner.removeEventListener("scroll", ownerScrolled);
      owner.removeEventListener("pointerdown", cancelSmoothScroll);
      owner.removeEventListener("wheel", wheel);
      owner.removeEventListener("touchstart", startDrag);
      owner.removeEventListener("touchmove", moveDrag);
      window.removeEventListener("touchend", endDrag);
      window.removeEventListener("touchcancel", cancelDrag);
    };
  }, [ref]);
}
