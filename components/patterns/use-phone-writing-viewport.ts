"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Size the active phone writer to the visible viewport and reveal only its caret. */
export function usePhoneWritingViewport(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    const app = root?.closest<HTMLElement>(".app");
    const viewport = window.visualViewport;
    if (!root || !app || !root.closest(".editor") || !viewport) return;
    const phone = window.matchMedia("(max-width: 767px)");
    let request = 0;
    let reveal = false;
    function clear() {
      if (!app) return;
      delete app.dataset.phoneKeyboard;
      app.style.removeProperty("--phone-writing-height");
      app.style.removeProperty("--phone-writing-top");
    }
    function measure() {
      if (!root || !app || !viewport) return;
      const active = document.activeElement;
      const focused = root.contains(active) || (active instanceof Element && !!active.closest("[data-writing-selection-menu]"));
      // Do not mistake pinch zoom or ordinary browser chrome for a keyboard.
      const keyboard = phone.matches && focused && viewport.scale === 1
        && window.innerHeight - viewport.height > 100;
      if (keyboard) {
        app.dataset.phoneKeyboard = "true";
        app.style.setProperty("--phone-writing-height", `${viewport.height}px`);
        app.style.setProperty("--phone-writing-top", `${viewport.offsetTop}px`);
      } else clear();
      if (!reveal || !phone.matches || !focused || viewport.scale !== 1) { reveal = false; return; }
      reveal = false;
      const selection = window.getSelection();
      if (!selection?.rangeCount || !selection.isCollapsed || !root.contains(selection.focusNode)) return;
      const element = selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode?.parentElement;
      const editable = element?.closest<HTMLElement>('[contenteditable="true"]');
      if (!editable) return;
      const range = selection.getRangeAt(0);
      const caret = range.getClientRects()[0];
      if (!caret?.height) return;
      const body = editable.closest<HTMLElement>(".writing-viewport");
      const owner = body && getComputedStyle(body).overflowY === "auto"
        ? body : root.closest<HTMLElement>(".main-content");
      if (!owner) return;
      const bounds = owner.getBoundingClientRect();
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const top = Math.max(bounds.top, viewport.offsetTop) + rem;
      // Leave breathing room for the native keyboard accessory controls.
      const bottom = Math.min(bounds.bottom, viewport.offsetTop + viewport.height) - (keyboard ? 3 : 1) * rem;
      if (bottom <= top) return;
      if (caret.bottom > bottom) owner.scrollTop += caret.bottom - bottom;
      else if (caret.top < top) owner.scrollTop -= top - caret.top;
    }
    function schedule(revealCaret = false) {
      reveal ||= revealCaret;
      cancelAnimationFrame(request);
      request = requestAnimationFrame(measure);
    }
    const resize = () => schedule(true);
    const pan = () => schedule();
    const editing = () => schedule(true);
    const blur = () => schedule();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", pan);
    phone.addEventListener("change", resize);
    root.addEventListener("focusin", editing);
    root.addEventListener("focusout", blur);
    root.addEventListener("input", editing);
    document.addEventListener("selectionchange", editing);
    return () => {
      cancelAnimationFrame(request);
      clear();
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", pan);
      phone.removeEventListener("change", resize);
      root.removeEventListener("focusin", editing);
      root.removeEventListener("focusout", blur);
      root.removeEventListener("input", editing);
      document.removeEventListener("selectionchange", editing);
    };
  }, [ref]);
}
