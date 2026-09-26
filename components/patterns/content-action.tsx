import { Slot } from "@radix-ui/react-slot";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
/** A rich content tile, separate from a compact command button. */
export function ContentAction({
  className,
  asChild = false,
  focusRing = "outside",
  ...props
}: ComponentProps<"button"> & {
  focusRing?: "outside" | "inside";
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : "button"}
      data-slot="content-action"
      className={cn(
        "group min-w-0 overflow-hidden rounded-lg border border-border bg-card text-left text-card-foreground transition-colors motion-reduce:transition-none hover:border-input hover:bg-surface hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        focusRing === "inside" &&
          "focus-visible:ring-inset focus-visible:ring-offset-0",
        className,
      )}
      {...props}
    />
  );
}
