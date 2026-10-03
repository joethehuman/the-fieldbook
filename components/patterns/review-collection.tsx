"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useScrollFade } from "./use-scroll-fade";
import { cn } from "@/lib/utils";

/** Fixed discovery/results/footer. Short viewports keep every control reachable. */
export function ReviewCollection({
  controls,
  children,
  footer,
}: {
  controls: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null),
    header = useRef<HTMLDivElement>(null),
    end = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const fade = useScrollFade<HTMLDivElement>();
  useLayoutEffect(() => {
    const measure = () => {
      if (body.current && header.current && end.current)
        setCompact(
          body.current.clientHeight <
            header.current.offsetHeight +
              end.current.offsetHeight +
              parseFloat(getComputedStyle(document.documentElement).fontSize) *
                8,
        );
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const ref of [body, header, end])
      if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={body}
      data-slot="review-collection"
      data-compact={compact}
      className={cn(
        "flex h-full min-h-0 flex-col gap-4",
        compact
          ? "overflow-y-auto overscroll-contain p-1"
          : "overflow-hidden p-1",
      )}
    >
      <div ref={header} className="shrink-0">
        {controls}
      </div>
      <div
        ref={fade.ref}
        onScroll={fade.measure}
        data-slot="review-results"
        data-scroll-fade-before={!compact && fade.edges.before}
        data-scroll-fade-after={!compact && fade.edges.after}
        className={cn(
          "min-h-32",
          compact
            ? "shrink-0"
            : "scroll-fade flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]",
        )}
      >
        {children}
      </div>
      <div ref={end} className="shrink-0">
        {footer}
      </div>
    </div>
  );
}

/** Whole-proposal count filters, independent of current search/page. */
export function ReviewCounts({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="review-counts"
      className="flex min-w-0 flex-wrap gap-2"
      aria-label="Whole-file summary"
    >
      {children}
    </div>
  );
}
