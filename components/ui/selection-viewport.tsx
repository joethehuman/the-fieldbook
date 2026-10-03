"use client";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { useScrollFade } from "../patterns/use-scroll-fade";

/** Reserve collection space while filtering; never move the following summary. */
export function SelectionViewport({
  className,
  children,
  fill = false,
  ...props
}: ComponentProps<"div"> & { fill?: boolean }) {
  const fade = useScrollFade<HTMLDivElement>();
  return (
    <div
      {...props}
      ref={fade.ref}
      onScroll={fade.measure}
      data-scroll-fade-before={fade.edges.before}
      data-scroll-fade-after={fade.edges.after}
      className={cn(
        "scroll-fade overflow-y-auto overscroll-y-contain border-t border-border [scrollbar-gutter:stable]",
        fill
          ? "min-h-[var(--selection-results-min-height)] flex-1"
          : "h-[var(--selection-results-height)] shrink-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
