import { Slot } from "@radix-ui/react-slot";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
/** A rich content tile, separate from a compact command button. */
export function ContentAction({
  className,
  asChild = false,
  focusRing = "outside",
  interaction = "surface",
  ...props
}: ComponentProps<"button"> & {
  focusRing?: "outside" | "inside";
  interaction?: "surface" | "lift";
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : "button"}
      data-slot="content-action"
      data-interaction={interaction}
      className={cn(
        "group min-w-0 overflow-hidden rounded-xl border border-border bg-card text-left text-card-foreground shadow-surface hover:border-input hover:bg-surface hover:no-underline active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        interaction === "lift" &&
          "transition-transform duration-150 ease-out motion-reduce:transition-none motion-safe:hover:-translate-y-0.5 hover:bg-card hover:shadow-card-hover active:translate-y-0 active:bg-card",
        focusRing === "inside" &&
          "focus-visible:ring-inset focus-visible:ring-offset-0",
        className,
      )}
      {...props}
    />
  );
}
