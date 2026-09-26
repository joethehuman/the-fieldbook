"use client";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { SectionHeader, SplitPanel } from "./layout";

/** Keep overflowing course strips keyboard-scrollable as their contents resize. */
export function CourseRow({
  title,
  children,
  heading,
  description,
  leading,
}: {
  title: string;
  children: ReactNode;
  heading?: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const element = row.current;
    if (!element) return;
    const measure = () => {
      const overflow = element.scrollWidth - element.clientWidth > 1;
      setScrollable((previous) => previous === overflow ? previous : overflow);
    };
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
  }, []);
  return (
    <div className="course-row-wrap">
      <SectionHeader
        title={heading || <h3>{title}</h3>}
        description={description}
      />
      <SplitPanel
        split={!!leading && Children.count(children) > 0}
        align="stretch"
      >
        {leading}
        <div
          ref={row}
          className="course-row"
          role="region"
          aria-label={title}
          tabIndex={scrollable ? 0 : undefined}
        >
          {children}
        </div>
      </SplitPanel>
    </div>
  );
}
