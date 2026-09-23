import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full min-w-0 resize-y rounded-control border border-control-border bg-background px-3 py-2 text-base sm:text-copy font-normal text-foreground outline-none transition-colors motion-reduce:transition-none hover:enabled:border-control-hover placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-disabled-background disabled:text-disabled-foreground disabled:border-border aria-invalid:border-destructive aria-invalid:hover:enabled:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
