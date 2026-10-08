import { Button } from "./button";
import { cn } from "@/lib/utils";
export type DistributionSegment = {
  id: string;
  label: string;
  count: number;
  tone:
    | "progress"
    | "success"
    | "success-soft"
    | "warning"
    | "destructive"
    | "muted";
};
export const distributionTone = {
  progress: "bg-link hover:bg-link",
  success: "bg-success hover:bg-success",
  "success-soft": "bg-success/60 hover:bg-success/60",
  warning: "bg-warning hover:bg-warning",
  destructive: "bg-destructive hover:bg-destructive",
  muted: "bg-muted-foreground hover:bg-muted-foreground",
};
/** Determinate counts. Text supplies the same information without relying on color. */
export function DistributionBar({
  segments,
  label,
  selected,
  onSelect,
}: {
  segments: DistributionSegment[];
  label: string;
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  const total = segments.reduce((n, s) => n + s.count, 0);
  return (
    <div
      data-slot="distribution-bar"
      role={onSelect ? "group" : "img"}
      aria-label={
        onSelect
          ? label
          : `${label}: ${segments.map((s) => `${s.label} ${s.count}`).join(", ")}`
      }
      className="flex h-5 w-full overflow-hidden rounded-control bg-muted"
    >
      {segments
        .filter((s) => s.count > 0)
        .map((s) =>
          onSelect ? (
            <Button
              key={s.id}
              type="button"
              variant="ghost"
              aria-label={`${s.label}: ${s.count} of ${total} people`}
              aria-pressed={selected === s.id}
              onClick={() => onSelect(s.id)}
              style={{ width: `${(s.count / total) * 100}%` }}
              className={cn(
                "min-h-0 h-full min-w-0 shrink rounded-none p-0 hover:opacity-80 focus-visible:ring-offset-0",
                distributionTone[s.tone],
              )}
            />
          ) : (
            <span
              key={s.id}
              aria-label={`${s.label}: ${s.count}`}
              style={{ width: `${(s.count / total) * 100}%` }}
              className={distributionTone[s.tone]}
            />
          ),
        )}
    </div>
  );
}
