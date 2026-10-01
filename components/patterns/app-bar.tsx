"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Remains in flow; only its measured height is shared with scroll destinations. */
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
    return () => {
      observer.disconnect();
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
