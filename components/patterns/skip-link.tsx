import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function SkipLink({ className, ...props }: ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-80 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}
