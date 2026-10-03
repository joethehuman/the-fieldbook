import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Textarea({
  className,
  size = "default",
  variant = "default",
  ...props
}: ComponentProps<"textarea"> & {
  size?: "default" | "compact";
  variant?: "default" | "embedded" | "document-title";
}) {
  return (
    <textarea
      data-slot="textarea"
      autoComplete="off"
      className={cn(
        "w-full min-w-0 bg-background text-base sm:text-copy font-normal text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-disabled-background disabled:text-disabled-foreground",
        variant === "document-title"
          ? "document-title resize-none overflow-hidden rounded-none border-0 p-0 font-semibold tracking-tight"
          : variant === "embedded"
          ? "resize-none rounded-control border-0 px-3 py-3"
          : "resize-y rounded-control border border-control-border px-3 py-2 hover:enabled:border-control-hover focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:border-border aria-invalid:border-destructive aria-invalid:hover:enabled:border-destructive",
        variant !== "document-title" && (size === "compact" ? "min-h-16" : "min-h-24"),
        className,
      )}
      {...props}
    />
  );
}
