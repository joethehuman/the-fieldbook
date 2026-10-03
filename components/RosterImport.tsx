"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, Upload } from "lucide-react";
import type { Workspace } from "@/lib/store";
import { downloadCsv } from "@/lib/csv";
import {
  ROSTER_IMPORT_COLUMNS,
  ROSTER_IMPORT_MAX_BYTES,
  reviewRosterCsv,
  rosterIssueReport,
  type ImportReviewRow,
  type RosterReview,
} from "@/lib/roster-import";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { FilePicker } from "./ui/file-picker";
import { Alert } from "./ui/alert";
import { Note } from "./ui/note";
import { ActionGroup } from "./ui/action-group";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogSteps,
  DialogBody,
  DialogFooter,
} from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { SelectField } from "./ui/select";
import {
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { FormField } from "./patterns/form-field";
import {
  CollectionControls,
  CollectionEmpty,
} from "./patterns/collection-controls";
import { DataTable } from "./patterns/data-table";
import { Pagination } from "./patterns/pagination";
import { ReviewCollection, ReviewCounts } from "./patterns/review-collection";

type StateFilter = "changes" | "all" | ImportReviewRow["status"];
const labels = {
  new: "New",
  changed: "Changed",
  unchanged: "Unchanged",
  issue: "Issues",
};
const pageSize = 25;
function impactText(review: RosterReview, id?: string) {
  const impact = review.impact.find((p) => p.id === id);
  if (!impact) return "";
  return [
    impact.coursesAdded.length && `${impact.coursesAdded.length} courses added`,
    impact.coursesRemoved.length &&
      `${impact.coursesRemoved.length} courses removed`,
    impact.updatesAdded && `${impact.updatesAdded} Updates added`,
    impact.updatesRemoved && `${impact.updatesRemoved} Updates removed`,
    (impact.reportingAdded.length || impact.reportingRemoved.length) &&
      "Reporting access changes",
  ]
    .filter(Boolean)
    .join(" · ");
}
function AffectedPeople({
  row,
  review,
}: {
  row: ImportReviewRow;
  review: RosterReview;
}) {
  const [page, setPage] = useState(1);
  const people = review.affectedPeople.filter((p) =>
    row.affected.includes(p.id),
  );
  if (!people.length) return null;
  return (
    <div className="grid gap-3" aria-label={`People affected by ${row.name}`}>
      <p className="font-medium">{people.length} affected people</p>
      <ul className="divide-y divide-border">
        {people.slice((page - 1) * pageSize, page * pageSize).map((p) => (
          <li key={p.id} className="py-2">
            <span>{p.name}</span>
            <small>{p.email}</small>
            <small>
              {impactText(review, p.id) ||
                "No assigned-course or reporting-access change."}
            </small>
          </li>
        ))}
      </ul>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={people.length}
        onPageChange={setPage}
        label="Affected people"
      />
    </div>
  );
}
function RowDetails({
  row,
  review,
  teams,
}: {
  row: ImportReviewRow;
  review: RosterReview;
  teams: boolean;
}) {
  const impact = review.impact.find((p) => p.id === row.id);
  const courseNames = (ids: string[]) =>
    ids
      .map((id) => review.courses.find((c) => c.id === id)?.title || "Course")
      .join("; ");
  return (
    <div
      className="grid gap-4 p-2"
      id={`details-${encodeURIComponent(row.key)}`}
    >
      <dl className="grid gap-2">
        {row.changes.map((c) => (
          <div key={c.field}>
            <dt className="font-medium">{c.field}</dt>
            <dd className="text-copy text-muted-foreground">
              {c.before} → {c.after}
            </dd>
          </div>
        ))}
      </dl>
      {row.notes.map((note) => (
        <p key={note} className="text-copy text-muted-foreground">
          {note}
        </p>
      ))}
      {row.issues.map((issue, i) => (
        <p key={i} className="text-copy">
          Row {issue.row} · {issue.column}: {issue.message}
        </p>
      ))}
      {impact && (
        <div className="grid gap-2 text-copy">
          {!!impact.coursesAdded.length && (
            <p>Courses added: {courseNames(impact.coursesAdded)}</p>
          )}
          {!!impact.coursesRemoved.length && (
            <p>Courses removed: {courseNames(impact.coursesRemoved)}</p>
          )}
          {!!impact.updatesAdded && (
            <p>{impact.updatesAdded} relevant Updates added.</p>
          )}
          {!!impact.updatesRemoved && (
            <p>{impact.updatesRemoved} relevant Updates removed.</p>
          )}
          {!!impact.reportingAdded.length && (
            <p>Visible to: {impact.reportingAdded.join(", ")}</p>
          )}
          {!!impact.reportingRemoved.length && (
            <p>No longer visible to: {impact.reportingRemoved.join(", ")}</p>
          )}
        </div>
      )}
      {teams && <AffectedPeople row={row} review={review} />}
      <p className="text-caption text-muted-foreground">
        {row.csvRows.length
          ? `CSV rows: ${row.csvRows.join(", ")}`
          : "Affected by changes elsewhere in the file."}
      </p>
    </div>
  );
}

export function RosterReviewPanel({ review }: { review: RosterReview }) {
  const [tab, setTab] = useState(review.valid ? "people" : "issues");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StateFilter>("changes");
  const [sort, setSort] = useState("name");
  const [issueKind, setIssueKind] = useState("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(new Set<string>());
  const all = [...review.people, ...review.teams];
  const counts = Object.fromEntries(
    Object.keys(labels).map((status) => [
      status,
      all.filter((r) => r.status === status).length,
    ]),
  );
  const source = tab === "teams" ? review.teams : review.people;
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = source
    .filter(
      (r) =>
        (state === "all" ||
          (state === "changes"
            ? r.status !== "unchanged"
            : r.status === state)) &&
        words.every((word) =>
          `${r.name} ${r.secondary} ${r.changes.map((c) => `${c.field} ${c.before} ${c.after}`).join(" ")}`
            .toLowerCase()
            .includes(word),
        ),
    )
    .sort(
      (a, b) =>
        (sort === "status" ? a.status.localeCompare(b.status) : 0) ||
        (sort === "reverse" ? -1 : 1) * a.name.localeCompare(b.name) ||
        a.key.localeCompare(b.key),
    );
  const issues = review.issues
    .filter(
      (i) =>
        (issueKind === "all" || i.code === issueKind) &&
        words.every((w) =>
          `${i.column} ${i.message} ${i.row}`.toLowerCase().includes(w),
        ),
    )
    .sort((a, b) => (sort === "reverse" ? b.row - a.row : a.row - b.row));
  const total = tab === "issues" ? issues.length : rows.length;
  const current = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  const clear = () => {
    setQuery("");
    setState("all");
    setIssueKind("all");
    setPage(1);
  };
  const groups = [
    ...new Map(review.issues.map((i) => [i.code, i.column])).entries(),
  ];
  const controls = (
    <div className="grid gap-3">
      <ReviewCounts>
        {Object.entries(labels)
          .filter(([key]) => key !== "issue")
          .map(([key, label]) => (
            <Button
              key={key}
              variant={
                state === key && tab !== "issues" ? "default" : "outline"
              }
              size="sm"
              aria-pressed={state === key && tab !== "issues"}
              onClick={() => {
                if (tab === "issues") setTab("people");
                setState(key as StateFilter);
                setPage(1);
              }}
            >
              {label} {counts[key]}
            </Button>
          ))}
        <Button
          variant={tab === "issues" ? "default" : "outline"}
          size="sm"
          aria-pressed={tab === "issues"}
          onClick={() => {
            setTab("issues");
            setQuery("");
            setPage(1);
          }}
        >
          Issues {review.issues.length}
        </Button>
      </ReviewCounts>
      <TabsList aria-label="Import review sections">
        <TabsTrigger value="people">People {review.people.length}</TabsTrigger>
        <TabsTrigger value="teams">Teams {review.teams.length}</TabsTrigger>
        <TabsTrigger value="issues">Issues</TabsTrigger>
      </TabsList>
      <CollectionControls
        secondaryRow
        search={
          <FormField label="Search review" visuallyHiddenLabel>
            <Input
              type="search"
              placeholder={
                tab === "issues"
                  ? "Search issues"
                  : "Search names, emails or changes"
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </FormField>
        }
        sortLabel={
          tab === "issues"
            ? "CSV row"
            : sort === "reverse"
              ? "Name Z–A"
              : sort === "status"
                ? "Change type"
                : "Name A–Z"
        }
        sort={
          <FormField label="Sort review">
            <SelectField
              value={sort}
              onValueChange={(v) => {
                setSort(v);
                setPage(1);
              }}
            >
              <option value="name">
                {tab === "issues" ? "CSV row" : "Name A–Z"}
              </option>
              {tab !== "issues" && (
                <>
                  <option value="reverse">Name Z–A</option>
                  <option value="status">Change type</option>
                </>
              )}
            </SelectField>
          </FormField>
        }
      >
        {tab === "issues" ? (
          <FormField label="Issue type">
            <SelectField
              value={issueKind}
              onValueChange={(v) => {
                setIssueKind(v);
                setPage(1);
              }}
            >
              <option value="all">All issues</option>
              {groups.map(([code, column]) => (
                <option key={code} value={code}>
                  {column} · {code.replaceAll("-", " ")} (
                  {review.issues.filter((i) => i.code === code).length})
                </option>
              ))}
            </SelectField>
          </FormField>
        ) : (
          <FormField label="Changes shown">
            <SelectField
              value={state}
              onValueChange={(v) => {
                setState(v as StateFilter);
                setPage(1);
              }}
            >
              <option value="changes">New, changed and issues</option>
              <option value="all">All records</option>
              {Object.entries(labels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectField>
          </FormField>
        )}
      </CollectionControls>
      <p className="text-caption text-muted-foreground">
        {review.valid
          ? "Saved course deadlines and completion stay fixed."
          : "Resolve all blocking issues and upload again before reviewing learning and reporting consequences."}
      </p>
    </div>
  );
  return (
    <Tabs
      className="h-full min-h-0"
      value={tab}
      onValueChange={(value) => {
        setTab(value);
        setPage(1);
        setQuery("");
      }}
    >
      <ReviewCollection
        controls={controls}
        footer={
          <Pagination
            page={current}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            label="Review"
          />
        }
      >
        <TabsContent value={tab} className="mt-0">
          {!total ? (
            <CollectionEmpty
              count={0}
              total={tab === "issues" ? review.issues.length : source.length}
              noun={tab === "issues" ? "issues" : "records"}
              onClear={clear}
            />
          ) : tab === "issues" ? (
            <TableContainer>
              <DataTable layout="rosterIssues">
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Column</TableHead>
                    <TableHead>Issue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues
                    .slice((current - 1) * pageSize, current * pageSize)
                    .map((i, n) => (
                      <TableRow key={`${i.row}-${i.code}-${n}`}>
                        <TableCell>{i.row || "File"}</TableCell>
                        <TableCell>
                          {i.column}
                          <small>
                            {i.severity === "error" ? "Blocking" : "Notice"}
                          </small>
                        </TableCell>
                        <TableCell>{i.message}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </DataTable>
            </TableContainer>
          ) : (
            <TableContainer>
              <DataTable layout="rosterReview">
                <TableHeader>
                  <TableRow>
                    <TableHead>{tab === "teams" ? "Team" : "Person"}</TableHead>
                    <TableHead>Changes</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>
                      <span className="sr-only">Details</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows
                    .slice((current - 1) * pageSize, current * pageSize)
                    .map((row) => (
                      <Fragment key={row.key}>
                        <TableRow>
                          <TableCell>
                            <strong>{row.name}</strong>
                            <small>{row.secondary}</small>
                          </TableCell>
                          <TableCell>
                            {row.issues.some((i) => i.severity === "error") ? (
                              row.issues.find((i) => i.severity === "error")!
                                .message
                            ) : row.changes[0] ? (
                              <>
                                <span className="text-copy">
                                  {row.changes[0].field}
                                </span>
                                <small>
                                  {row.changes[0].before} →{" "}
                                  {row.changes[0].after}
                                </small>
                                {row.changes.length > 1 && (
                                  <small>
                                    +{row.changes.length - 1} more changes
                                  </small>
                                )}
                              </>
                            ) : row.status === "changed" ? (
                              "Affected by team changes"
                            ) : (
                              "No field changes"
                            )}
                            {tab === "teams" && !!row.affected.length && (
                              <small>
                                {row.affected.length} affected people
                              </small>
                            )}
                            {tab === "people" && impactText(review, row.id) && (
                              <small>{impactText(review, row.id)}</small>
                            )}
                          </TableCell>
                          <TableCell>{labels[row.status]}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Details for ${row.name}`}
                              aria-expanded={expanded.has(row.key)}
                              aria-controls={`details-${encodeURIComponent(row.key)}`}
                              onClick={() =>
                                setExpanded((old) => {
                                  const next = new Set(old);
                                  if (next.has(row.key)) next.delete(row.key);
                                  else next.add(row.key);
                                  return next;
                                })
                              }
                            >
                              {expanded.has(row.key) ? (
                                <ChevronDown />
                              ) : (
                                <ChevronRight />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {expanded.has(row.key) && (
                          <TableRow>
                            <TableCell colSpan={4}>
                              <RowDetails
                                row={row}
                                review={review}
                                teams={tab === "teams"}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                </TableBody>
              </DataTable>
            </TableContainer>
          )}
        </TabsContent>
      </ReviewCollection>
    </Tabs>
  );
}

export function RosterImport({
  data,
  production = false,
  disabled = false,
}: {
  data: Workspace;
  production?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(0);
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [review, setReview] = useState<RosterReview | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    abort = useRef<AbortController | null>(null);
  const cancel = () => {
    generation.current++;
    abort.current?.abort();
    setBusy(false);
  };
  useEffect(
    () => () => {
      generation.current++;
      abort.current?.abort();
    },
    [],
  );
  const close = () => {
    cancel();
    setOpen(false);
    setFile(null);
    setReview(null);
    setError("");
    setStep(0);
  };
  async function choose(selected?: File) {
    cancel();
    setError("");
    setReview(null);
    setFile(null);
    if (!selected) return;
    if (!/\.csv$/i.test(selected.name)) {
      setError("Choose a CSV export, not an Excel workbook.");
      return;
    }
    if (selected.size > ROSTER_IMPORT_MAX_BYTES) {
      setError("Use a CSV smaller than 2 MB.");
      return;
    }
    const ticket = ++generation.current;
    setBusy(true);
    try {
      const csv = new TextDecoder("utf-8", { fatal: true }).decode(
        await selected.arrayBuffer(),
      );
      if (ticket === generation.current) setFile({ name: selected.name, csv });
    } catch {
      if (ticket === generation.current)
        setError("Unable to read this file. Choose it again.");
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  async function prepare() {
    if (!file || busy) return;
    if (review) {
      setStep(1);
      return;
    }
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      let result: RosterReview;
      if (production) {
        const response = await fetch("/api/admin/roster-import/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv: file.csv }),
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error || "Unable to review this file. Try again.",
          );
        result = body.review;
      } else result = reviewRosterCsv(file.csv, data);
      if (ticket === generation.current) {
        setReview(result);
        setStep(1);
      }
    } catch (e) {
      if (ticket === generation.current) setError((e as Error).message);
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Upload aria-hidden="true" />
        Import CSV
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent size="workflow-list">
          <DialogTitle>Review CSV import</DialogTitle>
          <DialogDescription>
            Preview only. No changes are saved.
          </DialogDescription>
          <DialogSteps steps={["Upload", "Review"]} current={step} />
          {error && (
            <Alert variant="destructive" role="alert">
              {error}
            </Alert>
          )}
          <DialogBody>
            <div hidden={step !== 0} className="h-full overflow-y-auto p-1">
              <div className="grid gap-5">
                <p className="text-copy">
                  Fill in the template, export it as CSV, then choose your file
                  to review. Use one row per person. For a team with no direct
                  members, fill in only the team columns.
                </p>
                <ActionGroup>
                  <Button asChild variant="outline">
                    <a href="/templates/people-import-template.csv" download>
                      <Download aria-hidden="true" />
                      Download template
                    </a>
                  </Button>
                  <Button asChild variant="link">
                    <a href="/templates/people-import-example.csv" download>
                      Download example
                    </a>
                  </Button>
                </ActionGroup>
                <FormField
                  label="CSV file"
                  description="UTF-8 CSV · up to 1,000 data rows · 2 MB"
                >
                  <FilePicker
                    accept=".csv,text/csv"
                    disabled={busy}
                    fileName={file?.name}
                    buttonLabel="Choose CSV file"
                    emptyLabel="No CSV file selected"
                    onFileChange={(selected) => void choose(selected)}
                  />
                </FormField>
                <Note>
                  <p>
                    Leave optional cells blank to keep existing values. People
                    and teams not listed in the file stay unchanged.
                  </p>
                  <p>
                    For new records, a blank Team or Parent team places them in
                    Organization. Enter Organization explicitly to move an
                    existing person or team there.
                  </p>
                </Note>
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="link" size="sm">
                      <ChevronDown aria-hidden="true" />
                      Column guide
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-2 py-3 text-copy">
                      {ROSTER_IMPORT_COLUMNS.map((c) => (
                        <Fragment key={c.key}>
                          <dt className="font-medium">{c.label}</dt>
                          <dd className="text-muted-foreground">
                            {c.guidance}
                          </dd>
                        </Fragment>
                      ))}
                    </dl>
                    <p className="text-copy text-muted-foreground">
                      Parents and managers can appear later in the file. Leave
                      Name, Email and Hire date blank on a team-only row.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
            {review && (
              <div hidden={step !== 1} className="h-full">
                <RosterReviewPanel review={review} />
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            {step === 0 ? (
              <>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  disabled={!file}
                  loading={busy}
                  onClick={() => void prepare()}
                >
                  {busy ? "Reviewing…" : "Review file"}
                </Button>
              </>
            ) : (
              <>
                <ActionGroup>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(0)}
                  >
                    Back
                  </Button>
                  {review && !!review.issues.length && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        downloadCsv(
                          rosterIssueReport(review.issues),
                          "people-import-issues",
                        )
                      }
                    >
                      <Download aria-hidden="true" />
                      Download issues
                    </Button>
                  )}
                </ActionGroup>
                <DialogClose asChild>
                  <Button type="button">Done</Button>
                </DialogClose>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
