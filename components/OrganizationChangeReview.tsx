"use client";
import { useEffect, useRef, useState } from "react";
import type { Workspace } from "@/lib/store";
import { teamPath } from "@/lib/team-hierarchy";
import { ScrollRegion } from "./patterns/scroll-region";
import { assignmentDeadline } from "@/lib/assignment-episodes";
import {
  organizationChangeSummary,
  type OrganizationChangeOptions,
} from "@/lib/organization-change";
import { Button } from "./ui/button";
import { SearchField } from "./patterns/search-field";
import { Input } from "./ui/input";
import { DataTable } from "./patterns/data-table";
import { Pagination } from "./patterns/pagination";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { ChevronDown } from "lucide-react";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableContainer,
} from "./ui/table";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";

type Review = {
  summary: ReturnType<typeof organizationChangeSummary>;
  after: Workspace;
  context?: OrganizationChangeOptions["review"];
  stamp: string;
  removedTeams: { id: string; path: string }[];
  promotedTeams: { id: string; path: string }[];
};
type ReviewRow = {
  key: string;
  person: string;
  item: string;
  change: string;
  date?: string;
};
export function useOrganizationChangeReview() {
  const [pending, setPending] = useState<Review | null>(null),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [details, setDetails] = useState(false);
  const resolve = useRef<((accepted: boolean) => void) | null>(null);
  useEffect(
    () => () => {
      resolve.current?.(false);
    },
    [],
  );
  function close(accepted: boolean) {
    resolve.current?.(accepted);
    resolve.current = null;
    setPending(null);
  }
  async function review(
    before: Workspace,
    after: Workspace,
    options?: OrganizationChangeOptions,
  ) {
    if (options?.review?.confirm) return options.review.confirm(before, after);
    const summary = organizationChangeSummary(before, after);
    if (!summary.changed && !options?.review?.always) return true;
    resolve.current?.(false);
    setQuery("");
    setPage(1);
    setDetails(false);
    setPending({
      summary,
      after,
      context: options?.review,
      stamp: new Date().toISOString(),
      promotedTeams: (after.teams || [])
        .filter((team) => {
          const old = before.teams?.find((value) => value.id === team.id);
          return (
            old?.parentId &&
            !after.teams?.some((value) => value.id === old.parentId)
          );
        })
        .map((team) => ({
          id: team.id,
          path: teamPath(team.id, after.teams || []),
        })),
      removedTeams: (before.teams || [])
        .filter((team) => !after.teams?.some((next) => next.id === team.id))
        .map((team) => ({
          id: team.id,
          path: teamPath(team.id, before.teams || []),
        })),
    });
    return new Promise<boolean>((done) => {
      resolve.current = done;
    });
  }
  const summary = pending?.summary;
  const rows: ReviewRow[] =
    !pending || !details
      ? []
      : [
          ...pending.summary.assignments.flatMap(({ person, gained, lost }) => [
            ...gained.map((course) => ({
              key: `add:${person.id}:${course.id}`,
              person: person.name,
              item: course.title,
              change: "Course assigned",
              date:
                pending.after.settings?.dueDatesEnabled !== false
                  ? assignmentDeadline(
                      pending.stamp,
                      {
                        ...person,
                        onboardingDays:
                          person.onboardingDays ??
                          pending.after.settings?.onboardingDays ??
                          90,
                      },
                      pending.after.settings?.catchUpDays ?? 30,
                    )
                  : undefined,
            })),
            ...lost.map((course) => ({
              key: `remove:${person.id}:${course.id}`,
              person: person.name,
              item: course.title,
              change: "Assignment removed",
            })),
          ]),
          ...pending.summary.reporting.map(({ manager, person, change }) => ({
            key: `report:${manager.id}:${person.id}:${change}`,
            person: person.name,
            item: `${manager.name}'s report`,
            change,
          })),
          ...pending.summary.updates.flatMap(({ person, gained, lost }) => [
            ...gained.map((c) => ({
              key: `update:add:${person.id}:${c.id}`,
              person: person.name,
              item: c.title,
              change: "Update relevance added",
            })),
            ...lost.map((c) => ({
              key: `update:remove:${person.id}:${c.id}`,
              person: person.name,
              item: c.title,
              change: "Update relevance removed",
            })),
          ]),
          ...pending.summary.guest.gained.map((c) => ({
            key: `guest:add:${c.id}`,
            person: "Public guests",
            item: c.title,
            change: "Recommendation added",
          })),
          ...pending.summary.guest.lost.map((c) => ({
            key: `guest:remove:${c.id}`,
            person: "Public guests",
            item: c.title,
            change: "Recommendation removed",
          })),
        ];
  const filtered = rows.filter((r) =>
    `${r.person} ${r.item} ${r.change}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const courseNames = (change: "gained" | "lost") => [
    ...new Map(
      (summary?.assignments.flatMap((r) => r[change]) || []).map((c) => [
        c.id,
        c.title,
      ]),
    ).values(),
  ];
  const names = (values: string[]) =>
    values.slice(0, 3).join(", ") +
    (values.length > 3 ? ` and ${values.length - 3} more` : "");
  const hasRows = !!summary?.changed;
  const dialog = (
    <Dialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogTitle>{pending?.context?.title || "Review changes"}</DialogTitle>
        <DialogDescription>
          {pending?.context?.description ||
            "Check who is affected, then apply these changes."}
        </DialogDescription>
        {!!pending?.removedTeams.length && (
          <ScrollRegion className="max-h-40 overscroll-auto" aria-label="Teams to delete">
            <ul className="grid gap-2 text-copy">
              {pending.removedTeams.map((team) => (
                <li key={team.id}>{team.path}</li>
              ))}
            </ul>
          </ScrollRegion>
        )}
        {!!pending?.promotedTeams.length && (
          <div className="grid gap-2">
            <p className="font-medium">Subteams moving to Organization</p>
            <ScrollRegion
              className="max-h-40 overscroll-auto"
              aria-label="Subteams moving to Organization"
            >
              <ul className="grid gap-2 text-copy">
                {pending.promotedTeams.map((team) => (
                  <li key={team.id}>{team.path}</li>
                ))}
              </ul>
            </ScrollRegion>
          </div>
        )}
        <div className="grid gap-3" aria-label="Change summary">
          {!!summary?.peopleGaining && (
            <div>
              <p>
                New assignments: {summary.peopleGaining}{" "}
                {summary.peopleGaining === 1 ? "user" : "users"} ·{" "}
                {summary.coursesGained}{" "}
                {summary.coursesGained === 1 ? "course" : "courses"}.
              </p>
              <p className="text-sm text-muted-foreground">
                {names(courseNames("gained"))}
              </p>
            </div>
          )}
          {!!summary?.peopleLosing && (
            <div>
              <p>
                Removed assignments: {summary.peopleLosing}{" "}
                {summary.peopleLosing === 1 ? "user" : "users"} ·{" "}
                {summary.coursesLost}{" "}
                {summary.coursesLost === 1 ? "course" : "courses"}.
              </p>
              <p className="text-sm text-muted-foreground">
                {names(courseNames("lost"))}
              </p>
            </div>
          )}
          {!!summary?.reporting.length && (
            <p>
              Reporting access changes for{" "}
              {new Set(summary.reporting.map((r) => r.manager.id)).size}{" "}
              {new Set(summary.reporting.map((r) => r.manager.id)).size === 1
                ? "manager"
                : "managers"}{" "}
              and {new Set(summary.reporting.map((r) => r.person.id)).size}{" "}
              {new Set(summary.reporting.map((r) => r.person.id)).size === 1
                ? "user"
                : "people"}
              .
            </p>
          )}
          {!!summary?.updates.length && (
            <p>Update relevance changes for {summary.updates.length} people.</p>
          )}
          {!!(summary?.guest.gained.length || summary?.guest.lost.length) && (
            <p>
              Public guest recommendations: {summary?.guest.gained.length} added
              · {summary?.guest.lost.length} removed.
            </p>
          )}
          {!hasRows && (
            <p className="text-copy text-muted-foreground">
              No course assignments, reporting access or recommendations change.
            </p>
          )}
          {!!summary?.assignments.length && (
            <p className="text-sm text-muted-foreground">
              Saved completions remain. Courses that stay assigned keep their
              deadlines.
              {summary.peopleGaining > 0 &&
              pending?.after.settings?.dueDatesEnabled !== false
                ? " New deadlines follow your due-date settings."
                : ""}
            </p>
          )}
        </div>
        {hasRows && (
          <Collapsible open={details} onOpenChange={setDetails}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost">
                {details ? "Hide details" : "View affected people and learning"}
                <ChevronDown aria-hidden="true" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-4 pt-4">
              <SearchField>
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search people, courses or managers"
                  aria-label="Find a user, course or manager"
                />
              </SearchField>
              <TableContainer>
                <DataTable
                  layout="organizationReview"
                  aria-label="Organization changes"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Learning or report</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Estimated due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice((page - 1) * 25, page * 25).map((r) => (
                      <TableRow key={r.key}>
                        <TableCell>{r.person}</TableCell>
                        <TableCell>{r.item}</TableCell>
                        <TableCell>{r.change}</TableCell>
                        <TableCell>{r.date || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              </TableContainer>
              {!filtered.length && (
                <p className="text-copy text-muted-foreground">
                  No matching changes.
                </p>
              )}
              <Pagination
                page={page}
                pageSize={25}
                total={filtered.length}
                onPageChange={setPage}
                label="Organization changes"
              />
            </CollapsibleContent>
          </Collapsible>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => close(true)}>
            {pending?.context?.confirmLabel || "Apply changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { review, dialog };
}
