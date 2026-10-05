import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The title grows; drag and action columns never depend on its length. */
export function ReorderRow({
  handle,
  selection,
  icon,
  compactActions = false,
  title,
  detail,
  actions,
  className,
  ...props
}: Omit<ComponentProps<"li">, "title"> & {
  handle: ReactNode;
  selection?: ReactNode;
  /** Align selection and type icon with the title, with metadata below. */
  icon?: ReactNode;
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
      {icon ? (
        <div
          className={cn(
            "grid min-w-0 items-start gap-x-2",
            selection
              ? "grid-cols-[auto_auto_minmax(0,1fr)_auto]"
              : "grid-cols-[auto_minmax(0,1fr)_auto]",
          )}
        >
          <div className="col-start-1 row-start-1 shrink-0 [&_button]:touch-none">
            {handle}
          </div>
          {selection && (
            <div className="col-start-2 row-start-1 flex h-control items-center justify-center">
              {selection}
            </div>
          )}
          <div
            className={cn(
              "row-start-1 flex min-w-0 items-start gap-2",
              selection
                ? "col-start-3 col-end-5 @min-[20rem]:col-end-4"
                : "col-start-2 col-end-4 @min-[20rem]:col-end-3",
            )}
          >
            <span
              data-slot="reorder-icon"
              aria-hidden="true"
              className="flex h-control shrink-0 items-center text-muted-foreground"
            >
              {icon}
            </span>
            <div
              data-slot="reorder-title"
              className="min-w-0 py-2 text-copy leading-5 [overflow-wrap:anywhere]"
            >
              {title}
            </div>
          </div>
          {detail && (
            <small
              data-slot="reorder-detail"
              className={cn(
                "row-start-2 ms-6 min-w-0 self-center text-muted-foreground",
                selection
                  ? "col-start-3 col-end-5 @min-[15rem]:col-end-4"
                  : "col-start-2 col-end-4 @min-[15rem]:col-end-3",
              )}
            >
              {detail}
            </small>
          )}
          <div
            data-slot="reorder-actions"
            className={cn(
              "row-start-3 flex flex-wrap items-center justify-end gap-2 @min-[15rem]:row-start-2 @min-[20rem]:row-start-1",
              selection
                ? "col-start-3 col-end-5 @min-[15rem]:col-start-4"
                : "col-start-2 col-end-4 @min-[15rem]:col-start-3",
            )}
          >
            {actions}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "grid min-w-0 items-center gap-3",
            selection
              ? compactActions
                ? "grid-cols-[auto_auto_minmax(0,1fr)] @min-[15rem]:grid-cols-[auto_auto_minmax(0,1fr)_auto]"
                : "grid-cols-[auto_auto_minmax(0,1fr)] @min-[20rem]:grid-cols-[auto_auto_minmax(0,1fr)_auto]"
              : compactActions
                ? "grid-cols-[auto_minmax(0,1fr)] @min-[12rem]:grid-cols-[auto_minmax(0,1fr)_auto]"
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
              <small className="mt-1 block text-muted-foreground">
                {detail}
              </small>
            )}
          </div>
          <div
            data-slot="reorder-actions"
            className={cn(
              "flex flex-wrap items-center justify-end gap-2",
              compactActions
                ? selection
                  ? "@min-[15rem]:col-span-1"
                  : "@min-[12rem]:col-span-1"
                : "@min-[20rem]:col-span-1",
              selection ? "col-span-3" : "col-span-2",
            )}
          >
            {actions}
          </div>
        </div>
      )}
    </li>
  );
}
