"use client";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { useScrollFade } from "./use-scroll-fade";

/** A bounded vertical viewport. Fade only the edges with more content beyond them. */
export function ScrollRegion({
  className,
  onScroll,
  hidden,
  ...props
}: ComponentProps<"div">) {
  const fade = useScrollFade<HTMLDivElement>(!hidden);
  return (
    <div
      {...props}
      hidden={hidden}
      ref={fade.ref}
      data-slot="scroll-region"
      data-scroll-fade-before={fade.edges.before}
      data-scroll-fade-after={fade.edges.after}
      onScroll={(event) => {
        fade.measure();
        onScroll?.(event);
      }}
      className={cn(
        "scroll-fade min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]",
        className,
      )}
    />
  );
}
