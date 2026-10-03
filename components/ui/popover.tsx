"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
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
export function PopoverResults({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-results"
      className={cn(
        "min-h-control max-h-60 flex-1 overflow-y-auto overscroll-y-contain pe-2 [scrollbar-gutter:stable]",
        className,
      )}
      {...props}
    />
  );
}
