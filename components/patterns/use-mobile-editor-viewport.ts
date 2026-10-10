"use client";

import { useLayoutEffect, type RefObject } from "react";

/** One browser viewport boundary for the mobile header, scroller and overlays. */
export function useMobileEditorViewport(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  afterLayout: RefObject<(() => void) | null>,
) {
  useLayoutEffect(() => {
    const shell = ref.current?.closest<HTMLElement>(".main-shell");
    if (!enabled || !shell) return;
    const viewport = window.visualViewport;
    let width = document.documentElement.clientWidth;
    let fullHeight = Math.max(document.documentElement.clientHeight, viewport?.height || window.innerHeight);
    let keyboard = false;
    let request = 0;
    const measure = () => {
      request = 0;
      const height = viewport?.height || document.documentElement.clientHeight;
      const nextWidth = document.documentElement.clientWidth;
      if (nextWidth !== width) {
        const shortSide = keyboard ? Math.min(width, fullHeight) : 0;
        width = nextWidth;
        fullHeight = Math.max(document.documentElement.clientHeight, height, shortSide);
      }
      const active = document.activeElement;
      const editing = active instanceof HTMLElement && (active.isContentEditable
        || active.matches("input:not([type=button]):not([type=checkbox]), textarea"));
      const unzoomed = !viewport || viewport.scale === 1;
      const occluded = fullHeight - height;
      keyboard = unzoomed && (keyboard ? occluded > 80 : editing && occluded > 120);
      if (!keyboard && !editing) fullHeight = Math.max(fullHeight, document.documentElement.clientHeight, height);
      shell.dataset.editorKeyboard = String(keyboard);
      if (unzoomed) {
        // Fixed coordinates come straight from the browser, never from a box
        // this hook moved. A restored height can precede offsetTop clearing.
        const top = Math.min(viewport?.offsetTop || 0, Math.max(0, fullHeight - height));
        shell.style.setProperty("--editor-viewport-top", `${top}px`);
        shell.style.setProperty("--editor-viewport-height", `${height}px`);
      } else {
        shell.style.removeProperty("--editor-viewport-top");
        shell.style.removeProperty("--editor-viewport-height");
      }
      afterLayout.current?.();
    };
    const schedule = () => { if (!request) request = requestAnimationFrame(measure); };
    measure();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(request);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      shell.style.removeProperty("--editor-viewport-top");
      shell.style.removeProperty("--editor-viewport-height");
      delete shell.dataset.editorKeyboard;
    };
  }, [ref, enabled, afterLayout]);
}
