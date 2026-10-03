import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Keep collection context beside a detail; narrow layouts show one destination. */
export function DirectoryWorkspace({
  navigation,
  navigationLabel,
  hasSelection,
  children,
}: {
  navigation: ReactNode;
  navigationLabel: string;
  hasSelection: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="directory-workspace"
      className="min-w-0 @container/directory"
    >
      <div className="grid min-w-0 items-start gap-6 @min-[56rem]/directory:grid-cols-[16rem_minmax(0,1fr)]">
        <aside
          aria-label={navigationLabel}
          className={cn(
            "min-w-0 @min-[56rem]/directory:block",
            hasSelection && "hidden",
          )}
        >
          {navigation}
        </aside>
        <div
          data-slot="directory-detail"
          className={cn(
            "grid min-w-0 gap-6 @min-[56rem]/directory:grid",
            !hasSelection && "hidden",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
