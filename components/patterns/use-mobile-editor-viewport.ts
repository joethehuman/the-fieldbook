"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Place the whole touch editor in the visible viewport, including native panning. */
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
    let previousSize: { height: number; width: number } | null = null;
    const releaseBody = () => {
      if (body.style.getPropertyValue("position") !== "fixed" || body.style.getPropertyPriority("position") !== "important") return;
      if (bodyPosition) body.style.setProperty("position", bodyPosition, bodyPositionPriority);
      else body.style.removeProperty("position");
    };
    const properties = ["height", "width", "top", "left", "bottom"] as const;
    const measure = () => {
      cancelAnimationFrame(request);
      request = 0;
      if (!touch.matches) return;
      // Pinch zoom changes the visible rectangle, not the document's layout.
      // Retain the last unzoomed height until the browser returns to scale 1.
      if (viewport && viewport.scale !== 1) return;
      const height = viewport?.height || document.documentElement.clientHeight || window.innerHeight;
      const width = viewport?.width || documentRoot.clientWidth || window.innerWidth;
      const top = viewport?.offsetTop || 0;
      const left = viewport?.offsetLeft || 0;
      if (![height, width, top, left].every(Number.isFinite) || height <= 0 || width <= 0) return;
      // Capture an eligible visible caret before this adapter shortens its
      // canvas. The writing owner may reveal that same target once after layout.
      if (previousSize && height < previousSize.height - 1 && Math.abs(width - previousSize.width) < 1)
        app.dispatchEvent(new Event("fieldbook:writing-viewport-shrink"));
      previousSize = { height, width };
      // Fixed positioning uses layout-viewport coordinates. Native input reveal
      // can pan the visual viewport with zero DOM scroll and ignore scrollTo.
      // Move the entire application boundary, never its header or caret alone.
      const rectangle = { height, width, top, left, bottom: Math.max(0, window.innerHeight - top - height) };
      for (const property of properties) {
        const name = `--editor-viewport-${property}`;
        const value = `${rectangle[property]}px`;
        if (documentRoot.style.getPropertyValue(name) !== value) documentRoot.style.setProperty(name, value);
      }
    };
    const schedule = () => {
      if (touch.matches && !request) request = requestAnimationFrame(measure);
    };
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
        previousSize = null;
        for (const property of properties) documentRoot.style.removeProperty(`--editor-viewport-${property}`);
        releaseBody();
      }
    };
    updateTouch();
    touch.addEventListener("change", updateTouch);
    // Apply the reported rectangle in this event, without another frame of
    // origin lag. Focus/page events coalesce their later geometry read below.
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    viewport?.addEventListener("scrollend", measure);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", measure, { passive: true });
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pageshow", schedule);
    return () => {
      cancelAnimationFrame(request);
      touch.removeEventListener("change", updateTouch);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
      viewport?.removeEventListener("scrollend", measure);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", measure);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pageshow", schedule);
      app.removeAttribute("data-mobile-editor-boundary");
      for (const property of properties) documentRoot.style.removeProperty(`--editor-viewport-${property}`);
      releaseBody();
    };
  }, [ref]);
}
