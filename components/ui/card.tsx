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
        "min-w-0 rounded-lg border border-border bg-card p-4 text-card-foreground sm:p-6",
        className,
      )}
      {...props}
    />
  );
}

// shadcn Card composition, styled to the observed Geist Fieldset surface.
export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("grid gap-2 px-5 pt-5", className)}
      {...props}
    />
  );
}
export function CardTitle({
  className,
  asChild = false,
  ...props
}: ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      data-slot="card-title"
      className={cn(
        "text-xl font-semibold leading-7 tracking-tight",
        className,
      )}
      {...props}
    />
  );
}
export function CardDescription({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-copy text-muted-foreground", className)}
      {...props}
    />
  );
}
export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("min-w-0 px-5 py-5", className)}
      {...props}
    />
  );
}
export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-b-lg border-t border-border bg-surface px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
