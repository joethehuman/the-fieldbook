import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva(
  "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-5 font-medium [overflow-wrap:anywhere]",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-foreground",
        success: "border-success/20 bg-success/5 text-success",
        warning: "border-warning/20 bg-warning/5 text-warning",
        destructive: "border-destructive/20 bg-destructive/5 text-destructive",
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
