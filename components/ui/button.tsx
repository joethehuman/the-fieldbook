import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Spinner } from "./spinner";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "no-underline hover:no-underline relative inline-flex w-fit shrink-0 items-center justify-center gap-2 rounded-control text-label font-medium border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:bg-disabled-background disabled:text-disabled-foreground disabled:border-border disabled:shadow-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary",
        outline:
          "border-input bg-background text-foreground shadow-surface hover:border-control-border hover:bg-surface hover:text-accent-foreground active:bg-accent",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground active:bg-muted-hover",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover active:bg-destructive",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-control px-3 py-1.5",
        sm: "min-h-control-sm px-2.5 py-1 text-label",
        icon: "size-control p-2",
      },
    },
    compoundVariants: [{ variant: "link", className: "min-h-0 px-0 py-0" }],
    defaultVariants: { variant: "default", size: "default" },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> &
  (
    { asChild: true; loading?: never } | { asChild?: false; loading?: boolean }
  )) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || props["aria-busy"]}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner className="absolute" />}
          <span
            className={cn(
              "inline-flex items-center justify-center gap-2",
              loading && "opacity-0",
            )}
          >
            {children}
          </span>
        </>
      )}
    </Comp>
  );
}
