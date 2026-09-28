import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Implicit labels preserve native form semantics and label Radix's button triggers. */
export function Field({
  className,
  orientation = "vertical",
  variant = "default",
  ...props
}: ComponentProps<"label"> & {
  orientation?: "vertical" | "horizontal";
  variant?: "default" | "choice";
}) {
  return (
    <label
      data-slot="field"
      className={cn(
        "min-w-0 text-label font-medium text-foreground",
        orientation === "horizontal" ? "flex items-center gap-3" : "grid gap-2",
        variant === "choice" &&
          "rounded-md border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
export function FieldGroup({
  className,
  ...props
}: ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-group"
      className={cn(
        "grid min-w-0 gap-4 border-0 p-0 [&>legend]:mb-4 [&>legend]:text-sm [&>legend]:font-semibold",
        className,
      )}
      {...props}
    />
  );
}
export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-copy font-normal text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Persistent validation copy. The owning field connects it with aria-describedby. */
export function FieldError({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-error"
      className={cn("text-copy font-normal text-destructive", className)}
      {...props}
    />
  );
}
