import type { ReactNode } from "react";
import { Tooltip } from "./tooltip";

/** A passive icon/count pair. Supply the complete meaning, including count, as its label. */
export function CountMetric({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: number;
  label: string;
}) {
  return (
    <Tooltip content={label}>
      <span
        data-slot="count-metric"
        role="img"
        aria-label={label}
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums text-muted-foreground"
      >
        <span aria-hidden="true" className="inline-flex items-center gap-1">
          {icon}
          {value}
        </span>
      </span>
    </Tooltip>
  );
}
