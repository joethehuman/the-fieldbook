import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function ActionGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("action-group", className)} {...props} />;
}
