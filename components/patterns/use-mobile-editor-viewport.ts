"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Bound the whole mobile document; only its canvas and popup scrollports scroll. */
export function useMobileEditorViewport(
  ref: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const shell = ref.current?.closest<HTMLElement>(".main-shell");
    const app = shell?.closest<HTMLElement>(".app");
    if (!shell || !app || !ref.current?.closest(".editor")) return;
    const documentRoot = document.documentElement;
    const body = document.body;
    const bodyPosition = body.style.getPropertyValue("position");
    const bodyPositionPriority = body.style.getPropertyPriority("position");
    const viewport = window.visualViewport;
    // Viewport safety follows touch capability, not toolbar presentation.
    // Rotation or attaching a trackpad must not reopen the outer page.
    const touch = window.matchMedia("(any-pointer: coarse)");
    let request = 0;
    const releaseBody = () => {
      if (body.style.getPropertyValue("position") !== "fixed" || body.style.getPropertyPriority("position") !== "important") return;
      if (bodyPosition) body.style.setProperty("position", bodyPosition, bodyPositionPriority);
      else body.style.removeProperty("position");
    };
    const restoreRoot = () => {
      if (!touch.matches || viewport && viewport.scale !== 1) return;
      // Overflow on html is propagated to the viewport as hidden, even when
      // declared clip. Native focus and ancestor reveals can still scroll it.
      // Never restore a canvas, textarea, code or popup scroll position here.
      if (window.scrollX || window.scrollY || documentRoot.scrollTop || document.body.scrollTop
        || viewport?.offsetTop || viewport?.offsetLeft)
        window.scrollTo({ left: 0, top: 0, behavior: "instant" });
    };
    const measure = () => {
      request = 0;
      if (!touch.matches) return;
      // Pinch zoom changes the visible rectangle, not the document's layout.
      // Retain the last unzoomed height until the browser returns to scale 1.
      if (viewport && viewport.scale !== 1) return;
      const height = viewport?.height || document.documentElement.clientHeight || window.innerHeight;
      if (!Number.isFinite(height) || height <= 0) return;
      const value = `${height}px`;
      if (documentRoot.style.getPropertyValue("--editor-viewport-height") !== value)
        documentRoot.style.setProperty("--editor-viewport-height", value);
      restoreRoot();
    };
    const schedule = () => {
      if (touch.matches && !request) request = requestAnimationFrame(measure);
    };
    const viewportChanged = () => { restoreRoot(); schedule(); };
    const visible = () => { if (document.visibilityState === "visible") schedule(); };
    const updateTouch = () => {
      app.toggleAttribute("data-mobile-editor-boundary", touch.matches);
      if (touch.matches) {
        // Radix's temporary scroll lock injects body position:relative!important.
        // The editor owns the document boundary throughout those popups too.
        // Restore the previous inline value when this session releases it.
        body.style.setProperty("position", "fixed", "important");
        measure();
      }
      else {
        cancelAnimationFrame(request);
        request = 0;
        documentRoot.style.removeProperty("--editor-viewport-height");
        releaseBody();
      }
    };
    updateTouch();
    touch.addEventListener("change", updateTouch);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", viewportChanged);
    viewport?.addEventListener("scrollend", viewportChanged);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", viewportChanged, { passive: true });
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pageshow", schedule);
    return () => {
      cancelAnimationFrame(request);
      touch.removeEventListener("change", updateTouch);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", viewportChanged);
      viewport?.removeEventListener("scrollend", viewportChanged);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", viewportChanged);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pageshow", schedule);
      app.removeAttribute("data-mobile-editor-boundary");
      documentRoot.style.removeProperty("--editor-viewport-height");
      releaseBody();
    };
  }, [ref]);
}
