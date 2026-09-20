"use client";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SectionHeader, SplitPanel } from "./layout";
import { Button } from "../ui/button";

/** Controls follow actual overflow, including resize and changing course lists. */
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
  const [edges, setEdges] = useState({ previous: false, next: false });
  useEffect(() => {
    const element = row.current;
    if (!element) return;
    const measure = () => {
      const previous = element.scrollLeft > 1;
      const next =
        element.scrollWidth - element.clientWidth - element.scrollLeft > 1;
      setEdges((old) =>
        old.previous === previous && old.next === next
          ? old
          : { previous, next },
      );
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
    element.addEventListener("scroll", measure, { passive: true });
    observe();
    return () => {
      resize.disconnect();
      mutation.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, []);
  function scroll(direction: number) {
    row.current?.scrollBy({
      left: direction * row.current.clientWidth * 0.85,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <div className="course-row-wrap">
      <SectionHeader
        title={heading || <h3>{title}</h3>}
        description={description}
      >
        {(edges.previous || edges.next) && (
          <div className="row-controls">
            <Button
              variant="outline"
              size="icon"
              aria-label={`Previous ${title} courses`}
              disabled={!edges.previous}
              onClick={() => scroll(-1)}
            >
              <ArrowLeft size={16} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={`Next ${title} courses`}
              disabled={!edges.next}
              onClick={() => scroll(1)}
            >
              <ArrowRight size={16} />
            </Button>
          </div>
        )}
      </SectionHeader>
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
          tabIndex={edges.previous || edges.next ? 0 : undefined}
        >
          {children}
        </div>
      </SplitPanel>
    </div>
  );
}
