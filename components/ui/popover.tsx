"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useLayoutEffect, useState, type ComponentProps } from "react";
import { useScrollFade } from "../patterns/use-scroll-fade";
import { cn } from "@/lib/utils";

// Owned shadcn composition: Radix owns dismissal, focus and collision handling.
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export function PopoverContent({
  className,
  align = "center",
  sideOffset = 8,
  layout = "default",
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content> & {
  layout?: "default" | "picker";
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-50 w-80 max-w-[calc(100vw-1.5rem)] max-h-[min(calc(100dvh-1.5rem),var(--radix-popover-content-available-height))] overflow-y-auto overscroll-y-contain pe-3 [scrollbar-gutter:stable] rounded-lg border border-border bg-popover text-popover-foreground shadow-floating outline-none",
          layout === "picker" &&
            "flex flex-col [&>:not([data-slot=popover-results])]:shrink-0",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/** A preferred list height that shrinks beneath stationary picker controls. */
export function PopoverResults({ className, children, visibleRows, onScroll, style, ...props }: ComponentProps<"div"> & { visibleRows?: number }) {
  const fade = useScrollFade<HTMLDivElement>(visibleRows !== undefined);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const list = fade.ref.current;
    if (!list || !visibleRows) return;
    const rows = Array.from(list.children);
    const measure = () => {
      const first = rows[0]?.getBoundingClientRect();
      const last = rows[Math.min(rows.length, visibleRows) - 1]?.getBoundingClientRect();
      setHeight(first && last ? last.bottom - first.top : undefined);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(list);
    rows.forEach((row) => resize.observe(row));
    return () => resize.disconnect();
  }, [children, visibleRows, fade.ref]);
  return (
    <div
      {...props}
      ref={fade.ref}
      data-slot="popover-results"
      data-scroll-fade-before={fade.edges.before}
      data-scroll-fade-after={fade.edges.after}
      style={{ ...style, ...(visibleRows && height ? { maxHeight: height } : {}) }}
      onScroll={(event) => { fade.measure(); onScroll?.(event); }}
      className={cn(
        "min-h-control max-h-60 flex-1 overflow-y-auto overscroll-y-contain pe-2 [scrollbar-gutter:stable]",
        visibleRows && "scroll-fade",
        className,
      )}
    >{children}</div>
  );
}
