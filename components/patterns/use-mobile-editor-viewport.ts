"use client";

import { useLayoutEffect, type RefObject } from "react";
import { mobileEditorLayout, mobileViewportQuietTime } from "./mobile-editor-layout";

/** One browser viewport boundary for the mobile header, scroller and overlays. */
export function useMobileEditorViewport(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useLayoutEffect(() => {
    const shell = ref.current?.closest<HTMLElement>(".main-shell");
    if (!enabled || !shell) return;
    const viewport = window.visualViewport;
    const layout = mobileEditorLayout(shell);
    let width = document.documentElement.clientWidth;
    let fullHeight = Math.max(document.documentElement.clientHeight, viewport?.height || window.innerHeight);
    let keyboard = false;
    let settledTimer = 0;
    const setStyle = (name: string, value: string) => {
      if (shell.style.getPropertyValue(name) !== value) shell.style.setProperty(name, value);
    };
    const measure = () => {
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
      const changed = layout.recordViewport(
        [height, viewport?.offsetTop || 0, viewport?.width || nextWidth, viewport?.offsetLeft || 0, viewport?.scale || 1],
        performance.now(),
      );
      if (changed) {
        window.clearTimeout(settledTimer);
        // Release deferred caret/overlay work after the last native movement.
        settledTimer = window.setTimeout(() => layout.schedule("viewport"), mobileViewportQuietTime + 1);
      }
      shell.dataset.editorKeyboard = String(keyboard);
      if (unzoomed) {
        // Fixed coordinates come straight from the browser, never from a box
        // this hook moved. A restored height can precede offsetTop clearing.
        const top = Math.min(viewport?.offsetTop || 0, Math.max(0, fullHeight - height));
        setStyle("--editor-viewport-top", `${top}px`);
        setStyle("--editor-viewport-height", `${height}px`);
      } else {
        shell.style.removeProperty("--editor-viewport-top");
        shell.style.removeProperty("--editor-viewport-height");
      }
    };
    const schedule = () => layout.schedule("viewport");
    const viewportChanged = () => {
      // Follow the native origin immediately, then reread it at the next paint:
      // a focus or scroll event can arrive before all viewport values agree.
      measure();
      schedule();
    };
    const unsubscribe = layout.subscribe("viewport", measure);
    viewport?.addEventListener("resize", viewportChanged);
    viewport?.addEventListener("scroll", viewportChanged);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", viewportChanged, { passive: true });
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      unsubscribe();
      window.clearTimeout(settledTimer);
      viewport?.removeEventListener("resize", viewportChanged);
      viewport?.removeEventListener("scroll", viewportChanged);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", viewportChanged);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      shell.style.removeProperty("--editor-viewport-top");
      shell.style.removeProperty("--editor-viewport-height");
      delete shell.dataset.editorKeyboard;
      layout.band = null;
      layout.viewport = null;
    };
  }, [ref, enabled]);
}
