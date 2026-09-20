import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva(
  "inline-flex w-fit items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-foreground",
        success: "border-success/20 bg-success/5 text-success",
        warning: "border-warning/20 bg-warning/5 text-warning",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof variants>) {
  return (
    <span
      data-slot="badge"
      className={cn(variants({ variant, className }))}
      {...props}
    />
  );
}
