import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The title grows; drag and action columns never depend on its length. */
export function ReorderRow({
  handle,
  selection,
  compactActions = false,
  title,
  detail,
  actions,
  className,
  ...props
}: Omit<ComponentProps<"li">, "title"> & {
  handle: ReactNode;
  selection?: ReactNode;
  compactActions?: boolean;
  title: ReactNode;
  detail?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <li
      data-slot="reorder-row"
      className={cn(
        "@container relative min-w-0 rounded-lg border border-border bg-card p-3 data-[dragging=true]:border-input data-[dragging=true]:bg-surface data-[dragging=true]:opacity-45 data-[selected=true]:bg-selected/40",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "grid min-w-0 items-center gap-3",
          selection
            ? compactActions
              ? "grid-cols-[auto_auto_minmax(0,1fr)] @min-[15rem]:grid-cols-[auto_auto_minmax(0,1fr)_auto]"
              : "grid-cols-[auto_auto_minmax(0,1fr)] @min-[20rem]:grid-cols-[auto_auto_minmax(0,1fr)_auto]"
            : compactActions
              ? "grid-cols-[auto_minmax(0,1fr)] @min-[15rem]:grid-cols-[auto_minmax(0,1fr)_auto]"
              : "grid-cols-[auto_minmax(0,1fr)] @min-[20rem]:grid-cols-[auto_minmax(0,1fr)_auto]",
        )}
      >
        <div className="shrink-0 [&_button]:touch-none">{handle}</div>
        {selection && (
          <div className="flex items-center justify-center self-center">
            {selection}
          </div>
        )}
        <div className="min-w-0 [overflow-wrap:anywhere]">
          {title}
          {detail && (
            <small className="mt-1 block text-muted-foreground">{detail}</small>
          )}
        </div>
        <div
          data-slot="reorder-actions"
          className={cn(
            "flex flex-wrap items-center justify-end gap-2",
            compactActions
              ? "@min-[15rem]:col-span-1"
              : "@min-[20rem]:col-span-1",
            selection ? "col-span-3" : "col-span-2",
          )}
        >
          {actions}
        </div>
      </div>
    </li>
  );
}
