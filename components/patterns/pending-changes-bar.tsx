"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ActionGroup } from "../ui/action-group";

/** Keep mounted directly above the content, within its existing scroll owner. */
export function PendingChangesBar({
  children,
  actions,
  active = true,
  feedback,
}: {
  children: ReactNode;
  actions: ReactNode;
  active?: boolean;
  feedback?: ReactNode;
}) {
  // Keep the last message's height while its grid row collapses.
  const [retainedFeedback, setRetainedFeedback] = useState(feedback);
  useEffect(() => {
    if (feedback) setRetainedFeedback(feedback);
  }, [feedback]);
  return (
    <div
      data-slot="pending-changes-region"
      data-active={active}
      aria-hidden={!active}
      inert={!active}
      className="sticky top-0 z-10 -mx-1 grid grid-rows-[0fr] bg-background transition-[grid-template-rows] duration-200 ease-out data-[active=true]:grid-rows-[1fr] motion-reduce:transition-none"
    >
      <div className="min-h-0 overflow-hidden">
        <div className="px-1 pt-2">
          <div
            data-slot="pending-changes-bar"
            className={`rounded-t-xl border border-border bg-card p-3 shadow-surface transition-[opacity,visibility] duration-200 ease-out motion-reduce:transition-none ${active ? "visible opacity-100" : "invisible opacity-0"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span role="status" className="text-copy font-medium">
                {children}
              </span>
              <ActionGroup>{actions}</ActionGroup>
            </div>
            <div
              data-slot="pending-changes-feedback"
              data-active={!!feedback}
              aria-hidden={!feedback}
              inert={!feedback}
              className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-200 ease-out data-[active=true]:grid-rows-[1fr] data-[active=true]:opacity-100 motion-reduce:transition-none"
            >
              <div className="min-h-0 overflow-hidden">
                <div className="pt-3">{feedback || retainedFeedback}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
