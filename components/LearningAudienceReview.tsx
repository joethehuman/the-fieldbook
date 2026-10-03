"use client";
import { useMemo, useState } from "react";
import type { Workspace } from "@/lib/store";
import type { LearningItem } from "@/lib/types";
import { learningAudienceReview } from "@/lib/learning-audience-review";
import { directlyAssignedAudiences } from "@/lib/assignment-audiences";
import { audienceOptions, contentAudienceKey } from "@/lib/content-audiences";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableContainer,
} from "./ui/table";
import { DataTable } from "./patterns/data-table";
import { SearchField } from "./patterns/search-field";
import { SelectionViewport } from "./ui/selection-viewport";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
export function LearningAudienceReview({
  before,
  after,
  item,
  stamp,
}: {
  before: Workspace;
  after: Workspace;
  item: LearningItem;
  stamp: string;
}) {
  const [query, setQuery] = useState("");
  const impact = useMemo(
    () => learningAudienceReview(before, after, item, stamp),
    [before, after, item, stamp],
  );
  const was = directlyAssignedAudiences(before, item),
    now = directlyAssignedAudiences(after, item);
  const options = audienceOptions(after);
  const changes = [
    ...now
      .filter((key) => !was.includes(key))
      .map((key) => ({ key, status: "Added" })),
    ...was
      .filter((key) => !now.includes(key))
      .map((key) => ({ key, status: "Removed" })),
  ];
  const dates = new Map<string, string[]>();
  impact.rows
    .filter((r) => r.status === "New assignment" && r.due)
    .forEach((r) =>
      dates.set(r.due!, [...(dates.get(r.due!) || []), r.person]),
    );
  const rows = impact.rows.filter((r) =>
    `${r.person} ${r.course} ${r.status}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-xl font-medium">
          {impact.gained
            ? `${impact.gained} ${impact.gained === 1 ? "person will" : "people will"} ${impact.dueDates ? "be newly assigned" : "receive a new learning recommendation"}.`
            : "No new course assignments."}
        </p>
        <p className="text-sm text-muted-foreground">
          {impact.total} {impact.total === 1 ? "person" : "people"} assigned in
          total · {impact.retained} already assigned
          {impact.lost ? ` · ${impact.lost} people lose this assignment` : ""}
        </p>
      </div>
      <div className="grid gap-2" aria-label="Audience changes">
        {changes.map(({ key, status }) => (
          <div
            className="flex justify-between gap-3 border-b border-border py-2 text-sm"
            key={key}
          >
            <span>
              {options.find((a) => contentAudienceKey(a) === key)?.name ||
                "Unavailable audience"}
            </span>
            <span className="text-muted-foreground">{status}</span>
          </div>
        ))}
      </div>
      {impact.dueDates && dates.size > 0 && (
        <p className="text-sm">
          Estimated due:{" "}
          {[...dates]
            .map(
              ([date, people]) =>
                `${dateLabel(date)} for ${people.length === 1 ? people[0] : `${people.length} people`}`,
            )
            .join("; ")}
          .
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Saved completions and learning history stay.
        {impact.dueDates
          ? " Existing assignments keep their saved deadlines."
          : " Due dates are off."}{" "}
        Curriculum assignments stay in place.
      </p>
      {options.some(
        (a) => a.publicGuests && now.includes(contentAudienceKey(a)),
      ) && (
        <p className="text-sm text-muted-foreground">
          Public guests receive recommendations in For you, without deadlines or
          tracked completion. Removing a direct choice cannot remove
          recommendations supplied by a curriculum.
        </p>
      )}
      {impact.rows.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="link">
              View people{impact.dueDates ? " and due dates" : ""}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-3 pt-3">
            {impact.rows.length > 10 && (
              <SearchField>
                <Input
                  type="search"
                  aria-label="Find an affected person"
                  placeholder="Find a person"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </SearchField>
            )}
            <SelectionViewport>
              <TableContainer>
                <DataTable
                  layout="audienceReview"
                  aria-label="Assignment recipients"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>Person</TableHead>
                      <TableHead>Assignment</TableHead>
                      <TableHead>{impact.dueDates ? "Due date" : ""}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={`${row.personId}:${row.courseId}`}>
                        <TableCell>
                          {row.person}
                          {item.kind === "curriculum" && (
                            <p className="text-xs text-muted-foreground">
                              {row.course}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.status === "Removed"
                            ? "Removed"
                            : impact.dueDates
                              ? row.status
                              : "Recommended"}
                        </TableCell>
                        <TableCell>
                          {row.due ? (
                            <span>
                              {dateLabel(row.due)}
                              <span className="block text-xs text-muted-foreground">
                                {row.saved ? "Saved deadline" : "Estimated due"}
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              </TableContainer>
              {!rows.length && (
                <p className="py-3 text-sm text-muted-foreground">
                  No matching people.
                </p>
              )}
            </SelectionViewport>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
