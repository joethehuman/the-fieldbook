"use client";
import { useEffect, useRef, useState } from "react";
import type { Workspace } from "@/lib/store";
import {
  assignmentImpact,
  reportingImpact,
  assignmentDeadline,
} from "@/lib/assignment-episodes";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { FormField } from "./patterns/form-field";
import { DataTable } from "./patterns/data-table";
import { Pagination } from "./patterns/pagination";
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

type ReviewRow = {
  key: string;
  person: string;
  item: string;
  change: string;
  date?: string;
};
export function useOrganizationChangeReview() {
  const [pending, setPending] = useState<ReviewRow[] | null>(null),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
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
  async function review(before: Workspace, after: Workspace) {
    if (
      ["users", "groups", "teams", "curricula"].every(
        (key) =>
          JSON.stringify(before[key as keyof Workspace]) ===
          JSON.stringify(after[key as keyof Workspace]),
      )
    )
      return true;
    const assignments = assignmentImpact(before, after),
      reporting = reportingImpact(before, after);
    const rows: ReviewRow[] = assignments.flatMap(
      ({ person, gained, lost }) => [
        ...gained.map((course) => ({
          key: `add:${person.id}:${course.id}`,
          person: person.name,
          item: course.title,
          change: "Course assigned",
          date: assignmentDeadline(
            new Date().toISOString(),
            {
              ...person,
              onboardingDays:
                person.onboardingDays ?? after.settings?.onboardingDays ?? 90,
            },
            after.settings?.catchUpDays ?? 30,
          ),
        })),
        ...lost.map((course) => ({
          key: `remove:${person.id}:${course.id}`,
          person: person.name,
          item: course.title,
          change: "Assignment removed",
        })),
      ],
    );
    rows.push(
      ...reporting.map(({ manager, person, change }) => ({
        key: `report:${manager.id}:${person.id}`,
        person: person.name,
        item: `${manager.name}'s report`,
        change,
      })),
    );
    if (!rows.length) return true;
    resolve.current?.(false);
    setQuery("");
    setPage(1);
    setPending(rows);
    return new Promise<boolean>((done) => {
      resolve.current = done;
    });
  }
  const filtered = (pending || []).filter((row) =>
    `${row.person} ${row.item} ${row.change}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const dialog = (
    <Dialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogTitle>Review organization changes</DialogTitle>
        <DialogDescription>
          Review courses and manager reporting access before saving. Existing
          continuous deadlines and saved completion stay fixed. New assignments
          start when you save; their estimated due dates appear below.
        </DialogDescription>
        <p className="text-copy">
          {pending?.filter((r) => r.change === "Course assigned").length || 0}{" "}
          course assignments added ·{" "}
          {pending?.filter((r) => r.change === "Assignment removed").length ||
            0}{" "}
          removed ·{" "}
          {pending?.filter((r) => r.change.startsWith("Reporting")).length || 0}{" "}
          reporting access changes.
        </p>
        <FormField label="Find a person, course or manager">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <TableContainer>
          <DataTable
            layout="organizationReview"
            aria-label="Organization changes"
          >
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Course or report</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Estimated due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice((page - 1) * 25, page * 25).map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.person}</TableCell>
                  <TableCell>{row.item}</TableCell>
                  <TableCell>{row.change}</TableCell>
                  <TableCell>{row.date || "—"}</TableCell>
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
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => close(true)}>
            Apply changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { review, dialog };
}
