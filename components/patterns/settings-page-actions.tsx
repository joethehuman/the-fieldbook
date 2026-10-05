import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One save area for settings pages whose sections share a single draft. */
export function SettingsPageActions({
  guidance,
  actions,
  trailingAction,
  belowActions,
  sticky = false,
}: {
  guidance: ReactNode;
  actions: ReactNode;
  trailingAction?: ReactNode;
  belowActions?: ReactNode;
  sticky?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Page actions"
      data-slot="settings-page-actions"
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 max-sm:grid-cols-[minmax(0,1fr)]",
        trailingAction && "grid-cols-[minmax(0,1fr)_auto_auto]",
        sticky && "sticky bottom-0 z-10 bg-background",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "col-span-full row-start-1 row-end-2 self-stretch rounded-xl border border-border bg-surface shadow-surface",
          trailingAction ? "max-sm:row-end-4" : "max-sm:row-end-3",
          sticky && "bg-surface/95 backdrop-blur-sm",
        )}
      />
      <p
        className={cn(
          "relative col-start-1 row-start-1 min-w-0 py-3 pl-5 text-copy text-muted-foreground [overflow-wrap:anywhere] max-sm:col-span-full max-sm:pr-5 max-sm:pb-1",
          sticky && "max-sm:sr-only",
        )}
      >
        {guidance}
      </p>
      <div className={cn(
        "relative col-start-2 row-start-1 py-3 max-sm:col-start-1 max-sm:col-span-full max-sm:row-start-2 max-sm:justify-self-end max-sm:px-5 max-sm:py-2",
        !trailingAction && "pr-5",
      )}>
        {actions}
      </div>
      {trailingAction && (
        <div className="relative col-start-3 row-start-1 py-3 pr-5 max-sm:col-start-1 max-sm:col-span-full max-sm:row-start-3 max-sm:justify-self-end max-sm:pb-3 max-sm:pl-5">
          {trailingAction}
        </div>
      )}
      {belowActions && (
        <div data-slot="settings-below-actions" className={cn(
          "col-start-2 row-start-2 justify-self-start pt-2 max-sm:col-start-1 max-sm:col-span-full max-sm:justify-self-end max-sm:px-5",
          trailingAction && "max-sm:row-start-4",
          !trailingAction && "max-sm:row-start-3",
        )}>
          {belowActions}
        </div>
      )}
    </div>
  );
}
