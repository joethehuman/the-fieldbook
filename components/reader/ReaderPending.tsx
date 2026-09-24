"use client";
import { useLinkStatus } from "next/link";
/** Inline feedback for dynamic reader links without streaming a false 200 for missing items. */
export function ReaderPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      role="status"
      className="ml-2 text-xs font-normal text-muted-foreground"
    >
      {pending ? "Just a sec…" : ""}
    </span>
  );
}
