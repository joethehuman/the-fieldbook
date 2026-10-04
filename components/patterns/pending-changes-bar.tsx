import type { ReactNode } from "react";
import { ActionGroup } from "../ui/action-group";

/** Keep mounted directly above the content, within its existing scroll owner. */
export function PendingChangesBar({
  children,
  actions,
  active = true,
}: {
  children: ReactNode;
  actions: ReactNode;
  active?: boolean;
}) {
  return (
    <div
      data-slot="pending-changes-region"
      data-active={active}
      aria-hidden={!active}
      inert={!active}
      className="sticky top-0 z-10 -mx-1 grid grid-rows-[0fr] bg-background transition-[grid-template-rows] duration-200 ease-out data-[active=true]:grid-rows-[1fr] motion-reduce:transition-none"
    >
      <div className="min-h-0 overflow-hidden">
        <div className="px-1 pb-6 pt-2">
          <div
            data-slot="pending-changes-bar"
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-surface transition-[opacity,visibility] duration-200 ease-out motion-reduce:transition-none ${active ? "visible opacity-100" : "invisible opacity-0"}`}
          >
            <span role="status" className="text-copy font-medium">
              {children}
            </span>
            <ActionGroup>{actions}</ActionGroup>
          </div>
        </div>
      </div>
    </div>
  );
}
