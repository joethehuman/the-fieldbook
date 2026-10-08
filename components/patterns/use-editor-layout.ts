"use client";

import { useLayoutEffect, type RefObject } from "react";
import { compactLayoutQuery } from "./use-compact-layout";

/** CSS distributes the remaining space; measurement only chooses a usable layout. */
export function useEditorLayout(ref: RefObject<HTMLFormElement | null>) {
  useLayoutEffect(() => {
    const editor = ref.current;
    const viewport = editor?.closest<HTMLElement>(".main-content");
    if (!editor || !viewport) return;
    let request = 0;
    let initialized = false;
    const observed = new Set<Element>();
    const observer = new ResizeObserver(schedule);
    function schedule() {
      cancelAnimationFrame(request);
      request = requestAnimationFrame(measure);
    }
    function measure() {
      if (!editor || !viewport) return;
      const content = editor.querySelector<HTMLElement>(".editor-content");
      const frame = editor.querySelector<HTMLElement>(".editor-frame");
      if (!content || !frame) return;
      const chrome = [
        ...Array.from(editor.children).filter((child) => child !== content),
        ...Array.from(content.children).filter((child) => child !== frame),
        ...Array.from(frame.children).filter((child) => !child.matches(".editor-frame-body")),
        ...editor.querySelectorAll(".editor-canvas-navigation, .mdxeditor-toolbar, .writing-view-header, .writing-root > .writing-editor-notice"),
      ];
      const next = new Set<Element>([editor, viewport, ...chrome]);
      for (const element of observed) if (!next.has(element)) {
        observer.unobserve(element);
        observed.delete(element);
      }
      for (const element of next) if (!observed.has(element)) {
        observer.observe(element);
        observed.add(element);
      }
      const style = getComputedStyle(viewport);
      const gap = (element: Element) => parseFloat(getComputedStyle(element).rowGap) || 0;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const reserved = chrome.reduce((height, element) => height + element.getBoundingClientRect().height, 0)
        + gap(editor) * (editor.children.length - 1) + gap(content) + gap(frame)
        + Array.from(editor.querySelectorAll(".writing-root")).reduce((height, root) => height + gap(root) * (root.children.length - 1), 0)
        + (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      // A phone document always flows through the page, including its blank
      // first paragraph. Keyboard changes must not swap or reset scroll owners.
      const phone = window.matchMedia(compactLayoutQuery).matches;
      const layout = !phone && frame.getBoundingClientRect().width >= 48 * rem
        && viewport.clientHeight - reserved >= 12 * rem ? "workspace" : "page";
      const writing = editor.querySelector<HTMLElement>(".writing-viewport") || editor.querySelector<HTMLElement>(".editor-frame-canvas");
      if (!initialized) viewport.scrollTop = 0;
      if (editor.dataset.scrollLayout !== layout) {
        const offset = initialized ? editor.dataset.scrollLayout === "workspace" ? writing?.scrollTop || 0 : viewport.scrollTop : 0;
        editor.dataset.scrollLayout = layout;
        if (layout === "workspace") {
          viewport.scrollTop = 0;
          if (writing) writing.scrollTop = offset;
        } else {
          if (writing) writing.scrollTop = 0;
          viewport.scrollTop = offset;
        }
      }
      initialized = true;
    }
    // Dynamic save notices and lazy/mode-specific toolbars also consume natural space.
    const mutations = new MutationObserver((records) => {
      if (records.some(({ target }) => !(target instanceof Element)
        || !target.closest(".writing-viewport, .editor-frame-details, .editor-frame-outline"))) schedule();
    });
    mutations.observe(editor, { childList: true, subtree: true });
    measure();
    return () => {
      cancelAnimationFrame(request);
      observer.disconnect();
      mutations.disconnect();
    };
  }, [ref]);
}
