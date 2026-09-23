import type { ComponentProps } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Persistent context, not a live announcement or field description. */
export function Note({
  children,
  className,
  tone = "default",
  ...props
}: ComponentProps<"div"> & { tone?: "default" | "warning" }) {
  const Icon = tone === "warning" ? TriangleAlert : Info;
  return (
    <div
      data-slot="note"
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-md border border-border bg-muted/40 p-4 text-copy [overflow-wrap:anywhere]",
        tone === "warning" && "border-warning/25 bg-warning/5 text-warning",
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="grid min-w-0 gap-2">{children}</div>
    </div>
  );
}
