import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, animated = true, ...props }: ComponentProps<"div"> & { animated?: boolean }) {
  return (
    <div
      {...props}
      aria-hidden="true"
      data-slot="skeleton"
      className={cn("rounded-md bg-muted", animated && "motion-safe:animate-pulse", className)}
    />
  );
}
