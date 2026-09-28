/** Keep the result range fixed while selection counts appear beside it. */
export function SelectionSummary({
  range,
  count,
}: {
  range?: string;
  count: number;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-copy tabular-nums text-muted-foreground">
      {range && (
        <span role="status" className="whitespace-nowrap">
          {range}
        </span>
      )}
      {count > 0 && (
        <span role="status" className="whitespace-nowrap">
          {count} selected
        </span>
      )}
    </div>
  );
}
