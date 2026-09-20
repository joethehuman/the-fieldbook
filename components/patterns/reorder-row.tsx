import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The title grows; drag and action columns never depend on its length. */
export function ReorderRow({
  handle,
  title,
  detail,
  actions,
  className,
  ...props
}: Omit<ComponentProps<"li">, "title"> & {
  handle: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <li
      data-slot="reorder-row"
      className={cn(
        "@container min-w-0 rounded-lg border border-border bg-card p-3",
        className,
      )}
      {...props}
    >
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 @min-[20rem]:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div className="shrink-0 [&_button]:touch-none">{handle}</div>
        <div className="min-w-0 [overflow-wrap:anywhere]">
          {title}
          {detail && (
            <small className="mt-1 block text-muted-foreground">{detail}</small>
          )}
        </div>
        <div
          data-slot="reorder-actions"
          className="col-span-2 flex flex-wrap items-center justify-end gap-2 @min-[20rem]:col-span-1"
        >
          {actions}
        </div>
      </div>
    </li>
  );
}
