import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Table({
  className,
  density = "comfortable",
  pinActions = false,
  ...props
}: ComponentProps<"table"> & {
  density?: "comfortable" | "compact";
  pinActions?: boolean;
}) {
  return (
    <table
      data-slot="table"
      data-density={density}
      data-pin-actions={pinActions}
      className={cn(
        "group/table w-full caption-bottom text-left text-sm",
        className,
      )}
      {...props}
    />
  );
}
export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={cn(
        "border-b border-border bg-muted/40 text-xs text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody className={cn("divide-y divide-border", className)} {...props} />
  );
}
export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "group/row hover:bg-muted/40 focus-within:bg-muted/40 group-data-[pin-actions=true]/table:hover:bg-surface group-data-[pin-actions=true]/table:focus-within:bg-surface",
        className,
      )}
      {...props}
    />
  );
}
export function TableHead({
  className,
  align,
  ...props
}: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-3 align-middle font-medium group-data-[density=compact]/table:px-3 group-data-[density=compact]/table:py-2",
        "group-data-[pin-actions=true]/table:last:sticky group-data-[pin-actions=true]/table:last:right-0 group-data-[pin-actions=true]/table:last:z-10 group-data-[pin-actions=true]/table:last:bg-surface group-data-[pin-actions=true]/table:last:before:absolute group-data-[pin-actions=true]/table:last:before:inset-y-0 group-data-[pin-actions=true]/table:last:before:right-full group-data-[pin-actions=true]/table:last:before:w-4 group-data-[pin-actions=true]/table:last:before:pointer-events-none group-data-[pin-actions=true]/table:last:before:bg-linear-to-r group-data-[pin-actions=true]/table:last:before:from-transparent group-data-[pin-actions=true]/table:last:before:to-surface",
        align === "right" && "text-right tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
export function TableCell({
  className,
  align,
  ...props
}: ComponentProps<"td">) {
  return (
    <td
      className={cn(
        "px-4 py-4 align-middle group-data-[density=compact]/table:px-3 group-data-[density=compact]/table:py-2 [&_strong]:font-medium [&_small]:mt-1 [&_small]:block [&_small]:text-xs [&_small]:text-muted-foreground",
        !(props.colSpan && props.colSpan > 1) &&
          "group-data-[pin-actions=true]/table:last:sticky group-data-[pin-actions=true]/table:last:right-0 group-data-[pin-actions=true]/table:last:z-10 group-data-[pin-actions=true]/table:last:bg-background group-data-[pin-actions=true]/table:last:group-hover/row:bg-surface group-data-[pin-actions=true]/table:last:group-focus-within/row:bg-surface group-data-[pin-actions=true]/table:last:before:absolute group-data-[pin-actions=true]/table:last:before:inset-y-0 group-data-[pin-actions=true]/table:last:before:right-full group-data-[pin-actions=true]/table:last:before:w-4 group-data-[pin-actions=true]/table:last:before:pointer-events-none group-data-[pin-actions=true]/table:last:before:bg-linear-to-r group-data-[pin-actions=true]/table:last:before:from-transparent group-data-[pin-actions=true]/table:last:before:to-background group-data-[pin-actions=true]/table:last:group-hover/row:before:to-surface group-data-[pin-actions=true]/table:last:group-focus-within/row:before:to-surface",
        align === "right" && "text-right tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
export function TableContainer({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Scrollable table"
      className={cn(
        "relative w-full min-w-0 overflow-x-auto rounded-lg border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
