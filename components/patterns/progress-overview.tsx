"use client";

import { completionPercent } from "@/lib/learning";
import { Card } from "../ui/card";
import { ProgressRing } from "../ui/progress";
import {
  DistributionBar,
  distributionTone,
  type DistributionSegment,
} from "../ui/distribution-bar";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import type { progressSummary } from "@/lib/progress-report";
type Summary = ReturnType<typeof progressSummary>;
function segments(summary: Summary, deadlines: boolean): DistributionSegment[] {
  return [
    {
      id: "current",
      label: "Up to date",
      count: summary.current,
      tone: "progress",
    },
    ...(deadlines
      ? [
          {
            id: "within",
            label: "Within due dates",
            count: summary.within,
            tone: "muted" as const,
          },
          {
            id: "overdue",
            label: "Overdue",
            count: summary.overdue,
            tone: "destructive" as const,
          },
        ]
      : [
          {
            id: "incomplete",
            label: "Incomplete",
            count: summary.incomplete,
            tone: "muted" as const,
          },
        ]),
  ];
}
export function ProgressOverview({
  summary,
  deadlines,
  status,
  onStatus,
}: {
  summary: Summary;
  deadlines: boolean;
  status: string;
  onStatus: (value: string) => void;
}) {
  const states = segments(summary, deadlines);
  return (
    <div
      data-slot="progress-overview"
      className="grid min-w-0 gap-4 lg:grid-cols-2"
    >
      <Card className="grid content-start gap-4">
        <h3 className="font-semibold">People up to date</h3>
        <div className="flex min-w-0 flex-wrap items-center gap-5">
          <ProgressRing
            value={
              summary.assignedPeople
                ? completionPercent(summary.current, summary.assignedPeople)
                : null
            }
            label="People up to date"
            caption="up to date"
          />
          <div className="grid min-w-0 flex-1 basis-32 gap-2">
            <p className="text-lg tabular-nums">
              <strong>
                {summary.current} of {summary.assignedPeople}
              </strong>{" "}
              people
            </p>
            <p className="text-sm text-muted-foreground">
              Completed every assigned course.
            </p>
            <p className="text-sm text-muted-foreground">
              {summary.unassigned}{" "}
              {summary.unassigned === 1 ? "user has" : "users have"} no assigned
              courses.
            </p>
          </div>
        </div>
      </Card>
      <Card className="grid content-start gap-5">
        <h3 className="font-semibold">Learning status</h3>
        <DistributionBar
          segments={states}
          label="Learning status"
          selected={status}
          onSelect={onStatus}
        />
        <div className="grid gap-2">
          {states.map((s) => (
            <Button
              key={s.id}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "min-w-0 w-full justify-start whitespace-normal text-left",
                status === s.id && "bg-accent",
              )}
              aria-pressed={status === s.id}
              onClick={() => onStatus(s.id)}
            >
              <span
                aria-hidden="true"
                className={cn("size-2 rounded-full", distributionTone[s.tone])}
              />
              <span className="min-w-0 flex-1">{s.label}</span>{" "}
              <strong className="tabular-nums">{s.count}</strong>
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {deadlines
            ? "Within due dates means unfinished courses, with none overdue."
            : "Due dates are off. Completion still includes all assigned courses."}
        </p>
      </Card>
    </div>
  );
}
