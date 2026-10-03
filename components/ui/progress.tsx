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
  compact = false,
  tone = "neutral",
}: {
  value: number;
  summary?: boolean;
  compact?: boolean;
  tone?: "neutral" | "complete" | "overdue";
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={
        summary
          ? "absolute inset-0 size-full -rotate-90"
          : compact
            ? "size-4 shrink-0 -rotate-90"
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
        className={tone === "overdue" ? "text-destructive/30" : "text-border"}
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
        className={
          tone === "overdue"
            ? "text-destructive"
            : tone === "complete"
              ? "text-success"
              : summary
                ? "text-link"
                : compact
                  ? "text-muted-foreground"
                  : "text-primary"
        }
      />
    </svg>
  );
}

export function ProgressRing({
  value,
  label = "Assigned course progress",
  caption = "complete",
  variant = "summary",
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"div"> & {
  value: number | null;
  label?: string;
  caption?: string;
  variant?: "summary" | "compact";
  tone?: "neutral" | "complete" | "overdue";
}) {
  const percent = percentage(value ?? 0);
  return (
    <div
      data-slot="progress-ring"
      className={cn(
        variant === "compact"
          ? "inline-flex items-center gap-2 rounded-sm text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          : "relative grid aspect-square w-34 max-w-full shrink-0 place-items-center rounded-full p-4",
        className,
      )}
      role={value === null ? "img" : "progressbar"}
      aria-label={value === null ? `${label}: no assigned courses` : label}
      aria-valuenow={value === null ? undefined : percent}
      aria-valuemin={value === null ? undefined : 0}
      aria-valuemax={value === null ? undefined : 100}
      aria-valuetext={value === null ? undefined : `${percent}% ${caption}`}
      {...props}
    >
      <RingGraphic
        value={percent}
        summary={variant === "summary"}
        compact={variant === "compact"}
        tone={tone}
      />
      {variant === "compact" ? (
        <span aria-hidden="true">{value === null ? "—" : `${percent}%`}</span>
      ) : (
        <div
          aria-hidden="true"
          className="grid place-content-center text-center"
        >
          <strong className="text-3xl leading-tight tabular-nums">
            {value === null ? (
              "—"
            ) : (
              <>
                {percent}
                <small>%</small>
              </>
            )}
          </strong>
          <span className="text-xs text-muted-foreground">
            {value === null ? "no assignments" : caption}
          </span>
        </div>
      )}
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
