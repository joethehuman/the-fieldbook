"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Native lesson scrolling needs enough room for both the reader and course outline. */
export function useCourseReaderLayout(ref: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const course = ref.current;
    const viewport = course?.closest<HTMLElement>(".main-content");
    const panel = course?.querySelector<HTMLElement>(".course-sidebar-panel");
    const details = panel?.querySelector<HTMLElement>(".course-detail-heading");
    const exit = panel?.querySelector<HTMLElement>(".course-sidebar-exit");
    const reader = course?.querySelector<HTMLElement>(".course-reader");
    if (!course || !viewport || !panel || !details || !exit || !reader) return;
    let request = 0;
    const observed = new Set<Element>();
    const observer = new ResizeObserver(schedule);
    function schedule() {
      cancelAnimationFrame(request);
      request = requestAnimationFrame(measure);
    }
    function measure() {
      if (!course || !viewport || !panel || !details || !exit || !reader) return;
      const siblings = Array.from(viewport.children).filter((child) => child !== course);
      const targets = new Set<Element>([
        course, viewport, panel, details, exit, reader, ...reader.children, ...siblings,
      ]);
      for (const element of observed) if (!targets.has(element)) {
        observer.unobserve(element);
        observed.delete(element);
      }
      for (const element of targets) if (!observed.has(element)) {
        observer.observe(element);
        observed.add(element);
      }
      const panelStyle = getComputedStyle(panel);
      const viewportStyle = getComputedStyle(viewport);
      const pixels = (value: string) => parseFloat(value) || 0;
      const rem = pixels(getComputedStyle(document.documentElement).fontSize);
      const chrome = details.getBoundingClientRect().height + exit.getBoundingClientRect().height
        + 2 * pixels(panelStyle.rowGap)
        + pixels(panelStyle.paddingTop) + pixels(panelStyle.paddingBottom)
        + pixels(panelStyle.borderTopWidth) + pixels(panelStyle.borderBottomWidth);
      panel.style.setProperty("--course-sidebar-chrome-height", `${chrome}px`);
      const available = viewport.clientHeight
        - pixels(viewportStyle.paddingTop) - pixels(viewportStyle.paddingBottom)
        - siblings.reduce((height, sibling) => height + sibling.getBoundingClientRect().height, 0)
        - siblings.length * pixels(viewportStyle.rowGap);
      const layout = innerWidth >= 70 * rem && course.clientWidth >= 48 * rem
        && available >= Math.max(chrome + 16 * rem, 12 * rem)
        && !course.querySelector(".course-video.theater") ? "workspace" : "page";
      if (course.dataset.scrollLayout !== layout) {
        course.dataset.scrollLayout = layout;
        if (layout === "workspace") viewport.scrollTop = 0;
      }
      // Only add a keyboard stop when this region actually has content to scroll.
      reader.tabIndex = layout === "workspace" && reader.scrollHeight > reader.clientHeight + 1 ? 0 : -1;
    }
    const mutations = new MutationObserver(schedule);
    mutations.observe(course, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(request);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [ref]);
}
