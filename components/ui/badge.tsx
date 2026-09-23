import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva(
  "inline-flex w-fit items-center gap-1 rounded-full border border-transparent px-2 py-0 text-xs leading-6 font-medium [overflow-wrap:anywhere]",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        destructive: "bg-destructive/10 text-destructive",
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
