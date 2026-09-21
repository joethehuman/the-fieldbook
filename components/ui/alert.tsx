import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva(
  "grid gap-2 rounded-md border px-4 py-3 text-sm leading-relaxed",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-foreground",
        destructive: "border-destructive/25 bg-destructive/5 text-destructive",
        success: "border-success/25 bg-success/5 text-success",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
export function Alert({
  className,
  variant,
  role,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof variants>) {
  return (
    <div
      data-slot="alert"
      role={role ?? (variant === "destructive" ? "alert" : "status")}
      className={cn(variants({ variant, className }))}
      {...props}
    />
  );
}
