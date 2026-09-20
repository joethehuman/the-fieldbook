import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
export function Card({
  className,
  asChild = false,
  ...props
}: ComponentProps<"section"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "section";
  return (
    <Comp
      data-slot="card"
      className={cn(
        "min-w-0 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xs sm:p-6",
        className,
      )}
      {...props}
    />
  );
}
