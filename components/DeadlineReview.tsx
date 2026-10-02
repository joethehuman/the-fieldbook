"use client";
import { useState } from "react";
import type { DeadlineReview as Review } from "@/lib/assignment-episodes";
import { Button } from "./ui/button";
import { Alert } from "./ui/alert";
import { Input } from "./ui/input";
import { FormField } from "./patterns/form-field";
import { Pagination } from "./patterns/pagination";
import { DataTable } from "./patterns/data-table";
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
import { useToast } from "./ui/toast";

export function DeadlineReview({
  onReview,
  disabled,
}: {
  onReview: (token?: string) => Promise<Review>;
  disabled?: boolean;
}) {
  const [review, setReview] = useState<Review | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  const notify = useToast();
  const rows = review
    ? [
        ...review.clocks.map((row) => ({
          ...row,
          key: `clock:${row.personId}`,
          title: "Onboarding end",
        })),
        ...review.courses.map((row) => ({
          ...row,
          key: `course:${row.personId}:${row.contentId}`,
        })),
      ].filter((row) =>
        `${row.name} ${row.title}`.toLowerCase().includes(query.toLowerCase()),
      )
    : [];
  return (
    <>
      <Button
        type="button"
        variant="outline"
        loading={busy && !review}
        disabled={disabled}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setReview(await onReview());
            setQuery("");
            setPage(1);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Review existing deadlines
      </Button>
      {!review && error && (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      )}
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setReview(null);
            setError("");
          }
        }}
      >
        <DialogContent
          className="max-w-4xl"
          onInteractOutside={(e) => {
            if (busy) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <DialogTitle>Recalculate existing deadlines</DialogTitle>
          <DialogDescription>
            Use the saved {review?.onboardingDays}-day onboarding and{" "}
            {review?.catchUpDays}-day catch-up windows for active people.
            Assignment start dates stay fixed. Completed courses keep their
            deadlines and completion.
          </DialogDescription>
          <p className="text-copy">
            {review?.clocks.length || 0} onboarding ends and{" "}
            {review?.courses.length || 0} unfinished course deadlines would
            change. A shorter window may make work overdue immediately; a longer
            onboarding window may return someone to New user.
          </p>
          {error && (
            <Alert variant="destructive" role="alert">
              {error}
            </Alert>
          )}
          <FormField label="Find a person or course">
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </FormField>
          <TableContainer>
            <DataTable layout="deadlineReview" aria-label="Deadline changes">
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Clock or course</TableHead>
                  <TableHead>Current date</TableHead>
                  <TableHead>Proposed date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice((page - 1) * 25, page * 25).map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>{row.before}</TableCell>
                    <TableCell>{row.after}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </TableContainer>
          {!rows.length && (
            <p className="text-copy text-muted-foreground">
              {query ? "No matching changes." : "No dates need to change."}
            </p>
          )}
          <Pagination
            page={page}
            pageSize={25}
            total={rows.length}
            onPageChange={setPage}
            label="Deadline changes"
            disabled={busy}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setReview(null);
                setError("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              loading={busy}
              disabled={
                !review ||
                (!review.clocks.length && !review.courses.length) ||
                !!error
              }
              onClick={async () => {
                if (!review) return;
                setBusy(true);
                setError("");
                try {
                  await onReview(review.token);
                  setReview(null);
                  notify("Existing deadlines recalculated.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Apply recalculation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
