import type { ReactNode } from "react";
import { ActionGroup } from "../ui/action-group";

/** Remain in the settings scroll owner so pending actions stay within reach. */
export function PendingChangesBar({
  children,
  actions,
}: {
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div
      data-slot="pending-changes-bar"
      className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-surface"
    >
      <span role="status" className="text-copy font-medium">
        {children}
      </span>
      <ActionGroup>{actions}</ActionGroup>
    </div>
  );
}
