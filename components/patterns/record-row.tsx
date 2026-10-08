import type { ComponentProps, ReactNode } from "react";
import { Button } from "../ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { ProgressRing } from "../ui/progress";
import { Tooltip } from "../ui/tooltip";
import { cn } from "@/lib/utils";

/** A visible record link; guarded navigation keeps existing editors and local demo routes. */
export function RecordName({
  className,
  children,
  href,
  onNavigate,
  onClick,
  ...props
}: ComponentProps<"button"> & { href?: string; onNavigate?: () => void }) {
  const classes = cn(
    "max-w-full justify-start rounded-sm text-left",
    className,
  );
  const title = typeof children === "string" ? children : undefined;
  const content = (
    <span className="line-clamp-2 [overflow-wrap:anywhere] group-data-[sizing=content]/table:line-clamp-none">{children}</span>
  );
  if (href)
    return (
      <Button {...props} asChild variant="link" className={classes}>
        <a
          href={href}
          title={title}
          aria-disabled={props.disabled || undefined}
          data-fieldbook-local-navigation={onNavigate ? "true" : undefined}
          onClick={(event) => {
            if (props.disabled) {
              event.preventDefault();
              return;
            }
            if (
              onNavigate &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey &&
              event.button === 0
            ) {
              event.preventDefault();
              onNavigate();
            }
          }}
        >
          {content}
        </a>
      </Button>
    );
  return (
    <Button
      type="button"
      title={title}
      variant="link"
      className={classes}
      onClick={onClick}
      {...props}
    >
      {content}
    </Button>
  );
}

export function RecordMeta({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-1 truncate text-xs text-muted-foreground group-data-[sizing=content]/table:whitespace-normal group-data-[sizing=content]/table:overflow-visible group-data-[sizing=content]/table:text-clip", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** Reveal full multi-value metadata without making every record several lines tall. */
export function RecordValues({
  values,
  label,
  empty,
}: {
  values: string[];
  label: string;
  empty: string;
}) {
  if (!values.length)
    return <span className="text-muted-foreground">{empty}</span>;
  if (values.length === 1) return <span>{values[0]}</span>;
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="truncate" title={values[0]}>
        {values[0]}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Show all ${values.length} ${label}`}
            className="text-xs tabular-nums text-muted-foreground"
          >
            +{values.length - 1}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label={label} className="p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            {values.length} {label}
          </div>
          <ul className="grid gap-2 text-sm">
            {values.map((value, index) => (
              <li key={`${value}-${index}`}>{value}</li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** One quiet value, with details on hover, keyboard activation, or touch. */
export function RecordProgress({
  percent,
  completed,
  assigned,
  status,
  overdue = 0,
}: {
  percent: number | null;
  completed: number;
  assigned: number;
  status: string;
  overdue?: number;
}) {
  const description =
    percent === null
      ? "No assigned courses"
      : `${completed} of ${assigned} courses complete · ${overdue ? `${overdue} overdue` : status}`;
  return (
    <div className="flex justify-start">
      <Popover>
        <Tooltip content={description}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2.5 font-normal"
              aria-label={`Completion details: ${description}`}
            >
              <ProgressRing
                variant="compact"
                value={percent}
                tone={
                  overdue ? "overdue" : percent === 100 ? "complete" : "neutral"
                }
                label={description}
              />
            </Button>
          </PopoverTrigger>
        </Tooltip>
        <PopoverContent
          align="start"
          aria-label="Completion details"
          className="w-64 p-3 text-sm"
        >
          {description}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Compact directory row, with independent selection, identity, metrics and actions. */
export function RecordListRow({
  selection,
  identity,
  detail,
  metrics,
  actions,
}: {
  selection?: ReactNode;
  identity: ReactNode;
  detail?: ReactNode;
  metrics: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div
      data-slot="record-list-row"
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-muted/40 focus-within:bg-muted/40 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,0.65fr)_auto_auto]"
    >
      <div className="row-span-2 flex items-center sm:row-span-1">
        {selection}
      </div>
      <div className="min-w-0">{identity}</div>
      <div className="hidden min-w-0 text-xs text-muted-foreground sm:block">
        {detail}
      </div>
      <div className="col-start-2 row-start-2 grid w-24 grid-cols-2 items-center gap-3 sm:col-auto sm:row-auto">
        {metrics}
      </div>
      <div className="col-start-3 row-span-2 row-start-1 sm:col-auto sm:row-span-1 sm:row-auto">
        {actions}
      </div>
    </div>
  );
}
