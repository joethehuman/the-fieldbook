import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Input({
  className,
  type,
  variant = "default",
  ...props
}: ComponentProps<"input"> & {
  variant?: "default" | "title" | "lesson-title";
}) {
  return (
    <input
      data-slot="input"
      type={type}
      autoComplete="off"
      className={cn(
        "flex min-h-control w-full min-w-0 rounded-control border border-control-border bg-background px-3 py-1.5 text-base sm:text-label font-normal text-foreground outline-none hover:enabled:border-control-hover placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-disabled-background disabled:text-disabled-foreground disabled:border-border aria-invalid:border-destructive aria-invalid:hover:enabled:border-destructive file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        (type === "hidden" || props.hidden) && "hidden",
        type === "color" && "size-10 shrink-0 cursor-pointer p-1",
        (variant === "title" || variant === "lesson-title") &&
          "max-w-(--editor-title-width) border-transparent bg-transparent px-0 py-2 text-left font-semibold tracking-tight hover:enabled:border-transparent focus-visible:border-transparent",
        variant === "title" && "text-page sm:text-page",
        variant === "lesson-title" && "text-2xl sm:text-2xl",
        className,
      )}
      {...props}
    />
  );
}
