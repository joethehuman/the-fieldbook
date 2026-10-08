"use client";

import { useLayoutEffect, type RefObject } from "react";
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
      if (!phone.matches || viewport!.scale !== 1) {
        keyboardOpen = false;
        space = 0;
        clear();
        return;
      }
      const occluded = window.innerHeight - viewport!.height;
      keyboardOpen = keyboardOpen ? occluded > 48 : editor!.contains(document.activeElement) && occluded > 100;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const next = keyboardOpen ? Math.max(0, window.innerHeight - viewport!.offsetTop - viewport!.height) + 3 * rem : 0;
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
      if (!phone.matches || viewport!.scale !== 1 || !root!.contains(document.activeElement)) return;
      const selection = window.getSelection();
      if (!selection?.rangeCount || !selection.isCollapsed || !root!.contains(selection.focusNode)) return;
      const element = selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode?.parentElement;
      if (!element?.closest('[contenteditable="true"]')) return;
      let caret = selection.getRangeAt(0).getClientRects()[0];
      if (!caret?.height) {
        // A new Lexical paragraph is <p><br></p>: its collapsed range has no
        // text rectangle. Use only that empty line, never the whole canvas.
        const line = element.closest("p, li, h1, h2, h3, h4, blockquote, pre");
        if (!line || line.textContent?.trim()) return;
        caret = line.getBoundingClientRect();
      }
      if (!caret.height) return;
      const bounds = owner!.getBoundingClientRect();
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const navigation = root!.closest(".editor-frame-canvas")?.querySelector(".editor-canvas-navigation")?.getBoundingClientRect().bottom || bounds.top;
      const heading = root!.querySelector(".writing-document-heading")?.getBoundingClientRect().bottom || bounds.top;
      const top = Math.max(bounds.top, viewport!.offsetTop, navigation, heading) + rem;
      const bottom = Math.min(bounds.bottom, viewport!.offsetTop + viewport!.height) - (keyboardOpen ? 3 : 1) * rem;
      if (bottom <= top) return;
      const delta = caret.bottom > bottom ? caret.bottom - bottom : caret.top < top ? caret.top - top : 0;
      if (Math.abs(delta) < 1) return;
      const next = Math.max(0, Math.min(owner!.scrollHeight - owner!.clientHeight, owner!.scrollTop + delta));
      owner!.scrollTo({ top: next, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
    function cancelReveal() {
      clearTimeout(settle);
      cancelAnimationFrame(request);
    }
    function schedule() {
      clearTimeout(settle);
      cancelAnimationFrame(request);
      // Let native focus/keyboard panning settle before one minimal correction.
      settle = window.setTimeout(() => { request = requestAnimationFrame(revealCaret); }, 100);
    }
    function resize() { reserveSpace(); schedule(); }
    function pan() { reserveSpace(); }
    function editing() { reserveSpace(); schedule(); }
    function blur() { reserveSpace(); }
    reserveSpace();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", pan);
    phone.addEventListener("change", resize);
    editor.addEventListener("focusin", editing);
    editor.addEventListener("focusout", blur);
    root.addEventListener("input", editing);
    document.addEventListener("selectionchange", schedule);
    owner.addEventListener("wheel", cancelReveal, { passive: true });
    owner.addEventListener("touchstart", cancelReveal, { passive: true });
    return () => {
      cancelReveal();
      clearTimeout(closing);
      clear();
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", pan);
      phone.removeEventListener("change", resize);
      editor.removeEventListener("focusin", editing);
      editor.removeEventListener("focusout", blur);
      root.removeEventListener("input", editing);
      document.removeEventListener("selectionchange", schedule);
      owner.removeEventListener("wheel", cancelReveal);
      owner.removeEventListener("touchstart", cancelReveal);
    };
  }, [ref]);
}
