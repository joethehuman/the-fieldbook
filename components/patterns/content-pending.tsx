/** Quiet, bounded feedback for actual content/data waits; no animation or shell replacement. */
export function ContentPending({
  label = "Loading content",
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid min-h-64 content-start gap-4"
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <div aria-hidden="true" className="grid gap-3">
        <div className="h-10 rounded-md bg-muted" />
        <div className="h-12 rounded-md bg-muted" />
        <div className="h-12 rounded-md bg-muted" />
        <div className="h-12 rounded-md bg-muted" />
      </div>
    </div>
  );
}
