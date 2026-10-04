import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border border-transparent px-2 py-0 text-xs leading-6 font-medium text-center whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        "destructive-soft": "bg-destructive-soft text-destructive",
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

/** A compact count that stays centered beside navigation and section labels. */
export function CountBadge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="count-badge"
      className={cn(
        "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 align-middle text-xs font-medium leading-none tabular-nums text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
