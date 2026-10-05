"use client";
import { Children, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { SectionHeader, SplitPanel } from "./layout";

/** Keep overflowing course strips keyboard-scrollable as their contents resize. */
export function CourseRow({
  title,
  children,
  heading,
  description,
  leading,
  splitAt,
}: {
  title: string;
  children: ReactNode;
  heading?: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  splitAt?: "tablet" | "xl";
}) {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({
    before: false,
    after: false,
    scrollable: false,
  });
  const measure = useCallback(() => {
    const element = row.current;
    if (!element) return;
    const scrollable = element.scrollWidth - element.clientWidth > 1;
    const before = scrollable && element.scrollLeft > 2;
    const after =
      scrollable &&
      element.scrollWidth - element.clientWidth - element.scrollLeft > 2;
    setEdges((previous) =>
      previous.before === before &&
      previous.after === after &&
      previous.scrollable === scrollable
        ? previous
        : { before, after, scrollable },
    );
  }, []);
  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    const resize = new ResizeObserver(measure);
    const observe = () => {
      resize.disconnect();
      resize.observe(element);
      for (const child of element.children) resize.observe(child);
      measure();
    };
    const mutation = new MutationObserver(observe);
    mutation.observe(element, { childList: true });
    observe();
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [measure]);
  return (
    <div className="course-row-wrap">
      <SectionHeader
        title={heading || <h3>{title}</h3>}
        description={description}
      />
      <SplitPanel
        split={!!leading && Children.count(children) > 0}
        align="stretch"
        splitAt={splitAt}
      >
        {leading}
        <div
          ref={row}
          className="course-row"
          role="region"
          aria-label={title}
          tabIndex={edges.scrollable ? 0 : undefined}
          data-scroll-before={edges.before}
          data-scroll-after={edges.after}
          onScroll={measure}
        >
          {children}
        </div>
      </SplitPanel>
    </div>
  );
}
