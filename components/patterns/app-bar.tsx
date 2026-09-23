"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Remains in flow; only its measured height is shared with scroll destinations. */
export function AppBar({ children }: { children: ReactNode }) {
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
    </header>
  );
}
