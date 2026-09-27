import { CheckCircle2 } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function percentage(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

/** Determinate progress only. Use Spinner/Skeleton for indeterminate activity. */
export function Progress({
  value,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & { value: number }) {
  const percent = percentage(value);
  return (
    <div
      role="progressbar"
      aria-label="Course progress"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** Shared ring geometry. The parent owns accessible progress and visible text. */
function RingGraphic({
  value,
  summary = false,
}: {
  value: number;
  summary?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={
        summary
          ? "absolute inset-0 size-full -rotate-90"
          : "size-5 shrink-0 -rotate-90"
      }
    >
      <circle
        cx="20"
        cy="20"
        r="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-border"
      />
      <circle
        cx="20"
        cy="20"
        r="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        pathLength="100"
        strokeDasharray={`${value} 100`}
        strokeLinecap={value ? "round" : "butt"}
        className={summary ? "text-link" : "text-primary"}
      />
    </svg>
  );
}

export function ProgressRing({
  value,
  label = "Assigned course progress",
}: {
  value: number;
  label?: string;
}) {
  const percent = percentage(value);
  return (
    <div
      data-slot="progress-ring"
      className="relative grid aspect-square w-34 max-w-full shrink-0 place-items-center rounded-full p-4"
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${percent}% complete`}
    >
      <RingGraphic value={percent} summary />
      <div aria-hidden="true" className="grid place-content-center text-center">
        <strong className="text-3xl leading-tight tabular-nums">
          {percent}
          <small>%</small>
        </strong>
        <span className="text-xs text-muted-foreground">complete</span>
      </div>
    </div>
  );
}

/** Compact course/curriculum state. Completion remains the caller's version-aware result. */
export function ProgressStatus({
  value,
  complete,
  started,
}: {
  value: number;
  complete: boolean;
  started: boolean;
}) {
  const percent = complete ? 100 : Math.min(99, percentage(value));
  const label = complete
    ? "Completed"
    : started
      ? "In progress"
      : "Not started";
  return (
    <span
      className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground"
      data-slot="progress-status"
    >
      {complete ? (
        <CheckCircle2
          aria-hidden="true"
          className="size-5 shrink-0 text-success"
        />
      ) : (
        <span role="img" aria-label={`${percent}% complete`}>
          <RingGraphic value={percent} />
        </span>
      )}
      {label}
    </span>
  );
}
