"use client";

import { useLayoutEffect, type RefObject } from "react";
import { touchWritingQuery } from "./use-editor-cards-layout";

/** Keep desktop writing room inside the canvas without changing its scroll owner. */
export function useWritingCanvasSpace(ref: RefObject<HTMLElement | null>, canvas: boolean) {
  useLayoutEffect(() => {
    const root = ref.current;
    const editor = root?.closest<HTMLElement>(".editor");
    const page = root?.closest<HTMLElement>(".main-content");
    if (!canvas || !root || !editor || !page) return;
    const touch = window.matchMedia(touchWritingQuery);
    let request = 0;
    const observed = new Set<Element>();
    const resize = new ResizeObserver(schedule);
    function clear() {
      root!.style.removeProperty("--writing-canvas-space");
      delete root!.dataset.writingCanvasSpace;
    }
    function schedule() {
      if (!request) request = requestAnimationFrame(measure);
    }
    function measure() {
      request = 0;
      const writing = root!.querySelector<HTMLElement>(".writing-viewport");
      const heading = root!.querySelector<HTMLElement>(".writing-document-heading");
      const navigation = editor!.dataset.scrollLayout === "page"
        ? root!.closest(".editor-frame-canvas")?.querySelector<HTMLElement>(".editor-canvas-navigation") : null;
      const toolbar = root!.querySelector<HTMLElement>(".mdxeditor-toolbar, .writing-view-header");
      const next = new Set<Element>([page!, ...[writing, heading, navigation, toolbar].filter((element): element is HTMLElement => !!element)]);
      for (const element of observed) if (!next.has(element)) {
        resize.unobserve(element);
        observed.delete(element);
      }
      for (const element of next) if (!observed.has(element)) {
        resize.observe(element);
        observed.add(element);
      }
      const content = root!.querySelector(".writing-document > .mdxeditor-root-contenteditable > .mdxeditor-contenteditable-wrapper > .writing-content[contenteditable]");
      if (touch.matches || !writing || !content) { clear(); return; }
      const owner = editor!.dataset.scrollLayout === "workspace" ? writing : page!;
      const style = getComputedStyle(owner);
      const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      const pinned = (heading?.getBoundingClientRect().height || 0) + (navigation?.getBoundingClientRect().height || 0);
      const usable = Math.max(0, owner.clientHeight - padding - pinned - (toolbar?.getBoundingClientRect().height || 0));
      const space = `${Math.round(usable * 0.3)}px`;
      if (root!.style.getPropertyValue("--writing-canvas-space") !== space) root!.style.setProperty("--writing-canvas-space", space);
      root!.dataset.writingCanvasSpace = "true";
    }
    const layout = new MutationObserver(schedule);
    layout.observe(editor, { attributes: true, attributeFilter: ["data-scroll-layout"] });
    const writing = new MutationObserver((records) => {
      if (records.some(({ target }) => !(target instanceof Element) || !target.closest(".writing-content"))) schedule();
    });
    writing.observe(root, { childList: true, subtree: true });
    touch.addEventListener("change", schedule);
    measure();
    return () => {
      cancelAnimationFrame(request);
      resize.disconnect();
      layout.disconnect();
      writing.disconnect();
      touch.removeEventListener("change", schedule);
      clear();
    };
  }, [ref, canvas]);
}
