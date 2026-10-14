"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Follow the visible viewport without moving the document or its selection. */
export function useMobileEditorToolbar(
  mobile: boolean,
  slotRef: RefObject<HTMLDivElement | null>,
  toolbarRef: RefObject<HTMLDivElement | null>,
) {
  useLayoutEffect(() => {
    const slot = slotRef.current;
    const toolbar = toolbarRef.current;
    if (!mobile || !slot || !toolbar) return;
    const viewport = window.visualViewport;
    // Like Floating UI's absolute positioning, WebKit client rects already
    // include visual viewport panning. Other engines use layout coordinates.
    const webkit = CSS.supports("-webkit-backdrop-filter", "none");
    let request = 0;
    const set = (name: string, value: number) => {
      const next = `${value}px`;
      if (toolbar.style.getPropertyValue(name) !== next) toolbar.style.setProperty(name, next);
    };
    const measure = () => {
      request = 0;
      const bounds = slot.getBoundingClientRect();
      const top = webkit ? 0 : viewport?.offsetTop || 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const offset = Math.max(0, top - bounds.top);
      const available = Math.max(0, bottom - (bounds.bottom + offset) - 8);
      // The sticky slot retains its natural height. Only its visual surface
      // moves; menus inherit both its position and remaining visible height.
      set("--editor-toolbar-offset", offset);
      set("--editor-mobile-overlay-height", available);
    };
    const schedule = () => {
      if (!request) request = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(slot);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    viewport?.addEventListener("scroll", schedule, { passive: true });
    viewport?.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(request);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
      viewport?.removeEventListener("scroll", schedule);
      viewport?.removeEventListener("resize", schedule);
      toolbar.style.removeProperty("--editor-toolbar-offset");
      toolbar.style.removeProperty("--editor-mobile-overlay-height");
    };
  }, [mobile, slotRef, toolbarRef]);
}
