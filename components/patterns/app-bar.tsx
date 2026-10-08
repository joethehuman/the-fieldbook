"use client";
import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const AppBarSearchCompactContext = createContext(false);

/** Shared app header measures its height and softens content passing beneath it. */
export function AppBar({
  children,
  pending = false,
}: {
  children: ReactNode;
  pending?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const searchMeasure = useRef<HTMLDivElement>(null);
  const [searchCollision, setSearchCollision] = useState(false);
  useLayoutEffect(() => {
    const bar = ref.current;
    const probe = searchMeasure.current;
    const editorHeader = bar?.querySelector<HTMLElement>(".app-editor-header");
    if (!bar || !probe || !editorHeader) return;
    let actions: HTMLElement | null = null;
    const measure = () => {
      const next = editorHeader.querySelector<HTMLElement>(".editor-heading-actions");
      if (next !== actions) {
        if (actions) observer.unobserve(actions);
        actions = next;
        if (actions) observer.observe(actions);
      }
      // The probe retains the full field's geometry even while search is an icon.
      // This makes the fit decision independent of the resulting header layout.
      const field = probe.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(bar).columnGap) || 16;
      setSearchCollision(!!actions && field.right + gap > actions.getBoundingClientRect().left);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    observer.observe(probe);
    const mutations = new MutationObserver(measure);
    mutations.observe(editorHeader, { childList: true, subtree: true, characterData: true });
    measure();
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, []);
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const root = document.documentElement;
    const measure = () =>
      root.style.setProperty(
        "--app-bar-height",
        `${bar.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    const content = bar.parentElement?.querySelector<HTMLElement>(".main-content");
    const measureScroll = () => {
      bar.dataset.contentScrolled = content && content.scrollTop > 1 ? "true" : "false";
    };
    measureScroll();
    content?.addEventListener("scroll", measureScroll, { passive: true });
    return () => {
      observer.disconnect();
      content?.removeEventListener("scroll", measureScroll);
      root.style.removeProperty("--app-bar-height");
    };
  }, []);
  return (
    <AppBarSearchCompactContext.Provider value={searchCollision}>
    <header ref={ref} className="topbar">
      <div ref={searchMeasure} className="app-search-measure" aria-hidden="true" />
      {children}
      {pending && (
        <div
          className="app-bar-progress"
          role="status"
          aria-label="Opening page"
        >
          <span aria-hidden="true" />
        </div>
      )}
    </header>
    </AppBarSearchCompactContext.Provider>
  );
}
