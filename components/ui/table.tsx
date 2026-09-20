import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      className={cn("w-full caption-bottom text-left text-sm", className)}
      {...props}
    />
  );
}
export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={cn(
        "border-b border-border bg-muted/50 text-xs text-muted-foreground",
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
      className={cn("transition-colors hover:bg-muted/40", className)}
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
        "px-4 py-3 align-middle font-medium",
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
        "px-4 py-3 align-middle [&_small]:mt-1 [&_small]:block [&_small]:text-muted-foreground",
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
      className={cn(
        "relative w-full overflow-x-auto rounded-lg border border-border",
        className,
      )}
      {...props}
    />
  );
}
