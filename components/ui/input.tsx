import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        "flex min-h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm font-normal text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        (type === "hidden" || props.hidden) && "hidden",
        type === "color" && "size-10 shrink-0 cursor-pointer p-1",
        className,
      )}
      {...props}
    />
  );
}
