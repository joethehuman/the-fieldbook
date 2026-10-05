import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

/** Pair an explicit save with the form's current draft state. The form owns the comparison. */
export function SaveChangesControl({
  dirty,
  busy = false,
  blockedReason,
  children,
  onClick,
}: {
  dirty: boolean;
  busy?: boolean;
  blockedReason?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const showBlockedReason = dirty && !busy && !!blockedReason;
  const status = busy
    ? "Saving changes…"
    : !dirty
      ? ""
      : blockedReason
        ? `Unsaved changes. ${blockedReason}`
        : "Unsaved changes";

  return (
    <div data-slot="save-changes-control" className="flex min-w-0 flex-wrap items-center gap-2">
      {status && (
        <span role="status" className={cn("text-caption text-muted-foreground", !showBlockedReason && "sr-only")}>
          {showBlockedReason ? blockedReason : status}
        </span>
      )}
      <Button
        type={onClick ? "button" : "submit"}
        onClick={onClick}
        loading={busy}
        disabled={!dirty || !!blockedReason}
      >
        {children}
      </Button>
    </div>
  );
}
