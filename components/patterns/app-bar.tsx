"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Shared app header measures its height and softens content passing beneath it. */
export function AppBar({
  children,
  pending = false,
}: {
  children: ReactNode;
  pending?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
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
    <header ref={ref} className="topbar">
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
  );
}
