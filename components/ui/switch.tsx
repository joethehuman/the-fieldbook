import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Native checkbox events/reset with on/off semantics; keep its label stable. */
export function Switch({
  className,
  ...props
}: Omit<ComponentProps<"input">, "type" | "role">) {
  return (
    <span className="relative inline-flex h-6 w-10 shrink-0">
      <input
        {...props}
        type="checkbox"
        role="switch"
        data-slot="switch"
        className={cn(
          "peer h-6 w-10 cursor-pointer appearance-none rounded-full border border-control-border bg-muted outline-none transition-colors motion-reduce:transition-none checked:border-primary checked:bg-primary hover:enabled:border-control-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 forced-colors:appearance-auto",
          className,
        )}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1 left-1 size-4 rounded-full bg-control-hover transition-transform motion-reduce:transition-none peer-checked:translate-x-4 peer-checked:bg-primary-foreground forced-colors:hidden"
      />
    </span>
  );
}
