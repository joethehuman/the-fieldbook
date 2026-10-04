"use client";

import { useLayoutEffect, type RefObject } from "react";

/** CSS distributes the remaining space; measurement only chooses a usable layout. */
export function useEditorLayout(ref: RefObject<HTMLFormElement | null>, focusMode = false) {
  useLayoutEffect(() => {
    const editor = ref.current;
    const viewport = editor?.closest<HTMLElement>(".main-content");
    if (!editor || !viewport) return;
    let request = 0;
    let phonePage = false;
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
        ...editor.querySelectorAll(".mdxeditor-toolbar, .writing-view-header, .writing-root > [role=alert]"),
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
      const phone = window.matchMedia("(max-width: 767px)").matches;
      if (!phone) phonePage = false;
      const visible = window.visualViewport;
      const available = phone && visible?.scale === 1
        ? Math.min(viewport.clientHeight, visible.offsetTop + visible.height - viewport.getBoundingClientRect().top)
        : viewport.clientHeight;
      const fits = (frame.getBoundingClientRect().width >= 48 * rem || phone)
        && available - reserved >= 12 * rem ? "workspace" : "page";
      // Once a keyboard needs the page fallback, retain its scroll owner for this
      // phone editor. Repeated keyboard dismissal must not reset the document.
      if (phone && fits === "page" && editor.closest<HTMLElement>(".app")?.dataset.phoneKeyboard === "true") phonePage = true;
      const layout = phonePage ? "page" : fits;
      if (editor.dataset.scrollLayout !== layout) {
        const selection = window.getSelection();
        const range = phone && selection?.isCollapsed && selection.rangeCount && editor.contains(selection.focusNode)
          ? selection.getRangeAt(0) : null;
        const before = range?.getClientRects()[0]?.top;
        editor.dataset.scrollLayout = layout;
        if (layout === "workspace") viewport.scrollTop = 0;
        else if (before !== undefined) {
          const after = range?.getClientRects()[0]?.top;
          if (after !== undefined) viewport.scrollTop += after - before;
        }
      }
    }
    // Dynamic save notices and lazy/mode-specific toolbars also consume natural space.
    const mutations = new MutationObserver((records) => {
      if (records.some(({ target }) => !(target instanceof Element)
        || !target.closest(".writing-viewport, .editor-frame-details, .editor-frame-outline"))) schedule();
    });
    mutations.observe(editor, { childList: true, subtree: true });
    window.visualViewport?.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(request);
      observer.disconnect();
      mutations.disconnect();
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [ref, focusMode]);
}
