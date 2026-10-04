import type { ReactNode } from "react";
import { CardFooter } from "../ui/card";

/** A quiet metadata footer with one persistent action menu. */
export function RecordCardFooter({
  children,
  actions,
}: {
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <CardFooter className="mt-auto flex-nowrap gap-3 bg-card">
      <div className="grid min-w-0 flex-1 gap-1 text-xs text-muted-foreground">
        {children}
      </div>
      <div className="shrink-0">{actions}</div>
    </CardFooter>
  );
}

export function RecordCardDetail({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-control-sm min-w-0 items-center gap-2 [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}
      <div className="min-w-0 [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}
