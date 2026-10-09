"use client";

import { useLayoutEffect, type RefObject } from "react";
import { readWritingCaretLine } from "./writing-cursor";
import { touchWritingQuery } from "./use-editor-cards-layout";
import { compactLayoutQuery } from "./use-compact-layout";

/** Keep phone writing in page flow; reserve keyboard space without resizing it. */
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
    let selectionPending = false;
    let caretNode: Node | null = null;
    let caretOffset = -1;
    let request = 0;
    let settle = 0;
    let closing = 0;
    let keyboardOpen = false;
    let space = 0;
    function clear() {
      owner!.style.removeProperty("--phone-keyboard-space");
      delete owner!.dataset.phoneKeyboardClosing;
    }
    function reserveSpace() {
      if (!phone.matches || !touch.matches || viewport!.scale !== 1) {
        keyboardOpen = false;
        space = 0;
        clear();
        return;
      }
      const occluded = document.documentElement.clientHeight - viewport!.height;
      keyboardOpen = keyboardOpen ? occluded > 48 : editor!.contains(document.activeElement) && occluded > 100;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      // innerHeight can already be keyboard-sized in iOS browser views. Reserve
      // the obscured part of the actual scroll owner, including native panning.
      const bounds = owner!.getBoundingClientRect();
      const visibleBottom = Math.min(bounds.bottom, viewport!.offsetTop + viewport!.height);
      const next = keyboardOpen ? Math.max(0, bounds.bottom - visibleBottom) + (editor!.querySelector(".editor-frame[data-dock=true]") ? 0 : 3 * rem) : 0;
      if (next === space) return;
      clearTimeout(closing);
      if (next === 0 && space > 0) {
        // Only dismissal eases away the spare scroll space. Opening reserves it
        // immediately so a blank line or the final paragraph can be revealed.
        owner!.dataset.phoneKeyboardClosing = "true";
        closing = window.setTimeout(() => { delete owner!.dataset.phoneKeyboardClosing; }, 220);
      } else delete owner!.dataset.phoneKeyboardClosing;
      space = next;
      owner!.style.setProperty("--phone-keyboard-space", `${space}px`);
    }
    function revealCaret() {
      const active = document.activeElement;
      if (dragging || !phone.matches || !touch.matches || viewport!.scale !== 1 || !(active instanceof HTMLElement) || !active.isContentEditable || !root!.contains(active)) return;
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
      const bounds = owner!.getBoundingClientRect();
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const navigation = root!.closest(".editor-frame-canvas")?.querySelector(".editor-canvas-navigation")?.getBoundingClientRect().bottom || bounds.top;
      const heading = root!.querySelector(".writing-document-heading")?.getBoundingClientRect().bottom || bounds.top;
      const top = Math.max(bounds.top, viewport!.offsetTop, navigation, heading) + rem;
      const dockClearance = parseFloat(getComputedStyle(owner!).getPropertyValue("--editor-dock-clearance")) || 0;
      // Protect the actual toolbar boundary, including native app panning,
      // rather than deriving its location from a viewport height difference.
      const dock = editor!.closest(".app")?.querySelector<HTMLElement>('.editor-frame-controls[data-dock="true"]');
      const bottom = dock
        ? Math.min(bounds.bottom, viewport!.offsetTop + viewport!.height, dock.getBoundingClientRect().top) - rem
        : Math.min(bounds.bottom, viewport!.offsetTop + viewport!.height) - Math.max((keyboardOpen ? 3 : 1) * rem, dockClearance);
      if (bottom <= top) return;
      const delta = caret.bottom > bottom ? caret.bottom - bottom : caret.top < top ? caret.top - top : 0;
      if (Math.abs(delta) < 1) return;
      const next = Math.max(0, Math.min(owner!.scrollHeight - owner!.clientHeight, owner!.scrollTop + delta));
      owner!.scrollTo({ top: next, behavior: "instant" });
    }
    function cancelReveal() {
      clearTimeout(settle);
      cancelAnimationFrame(request);
    }
    function schedule(delay = 100) {
      clearTimeout(settle);
      cancelAnimationFrame(request);
      // Focus and viewport changes settle; typing protects the next paint.
      settle = window.setTimeout(() => { request = requestAnimationFrame(revealCaret); }, delay);
    }
    function resize() { reserveSpace(); schedule(); }
    function pan() { reserveSpace(); }
    function editing(event: Event) { reserveSpace(); schedule(event.type === "input" ? 0 : 100); }
    function blur() { reserveSpace(); }
    function selectionMoved() {
      const selection = window.getSelection();
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.isContentEditable || !root!.contains(active) || !selection?.isCollapsed || !root!.contains(selection.focusNode)) return;
      if (selection.focusNode === caretNode && selection.focusOffset === caretOffset) return;
      caretNode = selection.focusNode; caretOffset = selection.focusOffset;
      if (dragging) selectionPending = true;
      else schedule(keyboardOpen ? 0 : 100);
    }
    function startDrag() { dragging = true; selectionPending = false; cancelReveal(); }
    function endDrag() {
      dragging = false;
      if (selectionPending) { selectionPending = false; schedule(keyboardOpen ? 0 : 100); }
    }
    reserveSpace();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", pan);
    window.addEventListener("scroll", pan, { passive: true });
    phone.addEventListener("change", resize);
    touch.addEventListener("change", resize);
    editor.addEventListener("focusin", editing);
    editor.addEventListener("focusout", blur);
    root.addEventListener("input", editing);
    document.addEventListener("selectionchange", selectionMoved);
    owner.addEventListener("wheel", cancelReveal, { passive: true });
    owner.addEventListener("touchstart", startDrag, { passive: true });
    window.addEventListener("touchend", endDrag);
    window.addEventListener("touchcancel", endDrag);
    return () => {
      cancelReveal();
      clearTimeout(closing);
      clear();
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", pan);
      window.removeEventListener("scroll", pan);
      phone.removeEventListener("change", resize);
      touch.removeEventListener("change", resize);
      editor.removeEventListener("focusin", editing);
      editor.removeEventListener("focusout", blur);
      root.removeEventListener("input", editing);
      document.removeEventListener("selectionchange", selectionMoved);
      owner.removeEventListener("wheel", cancelReveal);
      owner.removeEventListener("touchstart", startDrag);
      window.removeEventListener("touchend", endDrag);
      window.removeEventListener("touchcancel", endDrag);
    };
  }, [ref]);
}
