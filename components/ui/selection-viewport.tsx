"use client";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { useScrollFade } from "../patterns/use-scroll-fade";

/** Reserve collection space while filtering; never move the following summary. */
export function SelectionViewport({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  const fade = useScrollFade<HTMLDivElement>();
  return (
    <div
      {...props}
      ref={fade.ref}
      onScroll={fade.measure}
      data-scroll-fade-before={fade.edges.before}
      data-scroll-fade-after={fade.edges.after}
      className={cn(
        "scroll-fade h-[var(--selection-results-height)] shrink-0 overflow-y-auto overscroll-contain border-t border-border [scrollbar-gutter:stable]",
        className,
      )}
    >
      {children}
    </div>
  );
}
