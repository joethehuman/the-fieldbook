import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
/** A rich content tile, separate from a compact command button. */
export function ContentAction({
  className,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="content-action"
      className={cn(
        "group min-w-0 overflow-hidden rounded-lg border border-border bg-card text-left text-card-foreground transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
