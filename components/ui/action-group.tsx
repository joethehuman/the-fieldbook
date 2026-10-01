import { Children, Fragment, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function ActionGroup({
  className,
  variant = "default",
  children,
  ...props
}: ComponentProps<"div"> & { variant?: "default" | "text" }) {
  const actions = Children.toArray(children);
  return (
    <div
      data-slot="actions"
      data-variant={variant}
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    >
      {variant === "text"
        ? actions.map((action, index) => (
            <Fragment key={index}>
              {index > 0 && (
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
              )}
              {action}
            </Fragment>
          ))
        : children}
    </div>
  );
}
