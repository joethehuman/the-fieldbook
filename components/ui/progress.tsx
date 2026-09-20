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
      className="grid size-34 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(var(--brand) ${percent}%, var(--muted) 0)`,
      }}
      role="img"
      aria-label={`${percent}% complete`}
    >
      <div className="grid size-30 place-content-center rounded-full bg-card text-center">
        <strong className="text-3xl leading-tight">
          {percent}
          <small>%</small>
        </strong>
        <span className="text-xs text-muted-foreground">complete</span>
      </div>
    </div>
  );
}
