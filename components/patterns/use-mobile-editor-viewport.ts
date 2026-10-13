"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Size the mobile canvas without following native viewport panning. */
export function useMobileEditorViewport(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useLayoutEffect(() => {
    const shell = ref.current?.closest<HTMLElement>(".main-shell");
    if (!enabled || !shell) return;
    const viewport = window.visualViewport;
    let request = 0;
    const measure = () => {
      request = 0;
      // Pinch zoom changes the visible rectangle, not the document's layout.
      // Retain the last unzoomed height until the browser returns to scale 1.
      if (viewport && viewport.scale !== 1) return;
      const height = viewport?.height || document.documentElement.clientHeight || window.innerHeight;
      if (!Number.isFinite(height) || height <= 0) return;
      const value = `${height}px`;
      if (shell.style.getPropertyValue("--editor-viewport-height") !== value)
        shell.style.setProperty("--editor-viewport-height", value);
    };
    const schedule = () => {
      if (!request) request = requestAnimationFrame(measure);
    };
    measure();
    viewport?.addEventListener("resize", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(request);
      viewport?.removeEventListener("resize", schedule);
      window.removeEventListener("resize", schedule);
      shell.style.removeProperty("--editor-viewport-height");
    };
  }, [ref, enabled]);
}
