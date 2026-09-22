import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      aria-hidden="true"
      data-slot="skeleton"
      className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)}
    />
  );
}
