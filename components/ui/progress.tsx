import { CheckCircle2 } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Progress({
  value,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & { value: number }) {
  const percent = Math.max(
    0,
    Math.min(100, Number.isFinite(value) ? value : 0),
  );
  return (
    <div
      role="progressbar"
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

export function ProgressRing({ value }: { value: number }) {
  const percent = Math.max(
    0,
    Math.min(100, Number.isFinite(value) ? value : 0),
  );
  return (
    <div
      className="grid aspect-square w-34 max-w-full shrink-0 place-items-center rounded-full p-2"
      style={{
        background: `conic-gradient(var(--brand) ${percent}%, var(--muted) 0)`,
      }}
      role="img"
      aria-label={`${percent}% complete`}
    >
      <div className="grid size-full place-content-center rounded-full bg-card text-center">
        <strong className="text-3xl leading-tight">
          {percent}
          <small>%</small>
        </strong>
        <span className="text-xs text-muted-foreground">complete</span>
      </div>
    </div>
  );
}

/** Compact companion to the summary ring, shared by course and curriculum cards. */
export function ProgressStatus({
  value,
  complete,
  started,
}: {
  value: number;
  complete: boolean;
  started: boolean;
}) {
  const percent = complete
    ? 100
    : Math.min(99, Math.max(0, Number.isFinite(value) ? value : 0));
  const label = complete
    ? "Completed"
    : started
      ? "In progress"
      : "Not started";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground"
      data-slot="progress-status"
    >
      {complete ? (
        <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="size-5 -rotate-90"
          role="img"
          aria-label={`${percent}% complete`}
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted"
          />
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            pathLength="100"
            strokeDasharray={`${percent} 100`}
            strokeLinecap={percent ? "round" : "butt"}
            className="text-primary"
          />
        </svg>
      )}
      {label}
    </span>
  );
}
