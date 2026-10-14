"use client";

import { useLayoutEffect, type RefObject } from "react";

/** One fixed surface and a normal-flow placeholder, as in CKEditor's sticky panel. */
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
    const frame = slot.closest<HTMLElement>(".editor-frame")!;
    // Ordinary WebKit client rects are visual-relative. Fixed CSS coordinates
    // need the visual offset back, unlike the prose reveal calculation.
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
      const height = toolbar.offsetHeight;
      const pinned = bounds.top <= top + 1 && frame.getBoundingClientRect().bottom > top;
      // Keep the same DOM surface, focus and menu host through pin/unpin.
      // Measuring a static origin avoids stale compensation on scroll reversal.
      slot.style.height = `${height}px`;
      set("--editor-toolbar-top", viewport?.offsetTop || 0);
      set("--editor-toolbar-left", bounds.left + (webkit ? viewport?.offsetLeft || 0 : 0));
      set("--editor-toolbar-width", bounds.width);
      set("--editor-mobile-overlay-height", Math.max(0, bottom - (pinned ? top + height : bounds.top + height) - 8));
      toolbar.toggleAttribute("data-pinned", pinned);
    };
    const schedule = () => {
      if (!request) request = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(slot);
    resize.observe(toolbar);
    resize.observe(frame);
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
      slot.style.removeProperty("height");
      toolbar.removeAttribute("data-pinned");
      ["--editor-toolbar-top", "--editor-toolbar-left", "--editor-toolbar-width", "--editor-mobile-overlay-height"]
        .forEach(name => toolbar.style.removeProperty(name));
    };
  }, [mobile, slotRef, toolbarRef]);
}
