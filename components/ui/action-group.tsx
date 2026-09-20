import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function ActionGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="actions"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}
