"use client";
import { sortLabels } from "@/lib/collection-sort";
import { SortPicker } from "./patterns/sort-picker";
import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, Upload } from "lucide-react";
import type { Workspace } from "@/lib/store";
import { downloadCsv } from "@/lib/csv";
import {
  ROSTER_IMPORT_COLUMNS,
  ROSTER_IMPORT_MAX_BYTES,
  ROSTER_IMPORT_MAX_ROWS,
  reviewRosterCsv,
  prepareRosterCsv,
  materializeRoster,
  rosterBaseline,
  rosterIssueReport,
  type ImportReviewRow,
  type RosterReview,
} from "@/lib/roster-import";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { ScrollRegion } from "./patterns/scroll-region";
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
const reviewValue = (row: ImportReviewRow, field: string) =>
  row.values.find((value) => value.field === field)?.value || "Not resolved";
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
      <p className="font-semibold">
        {row.values.length ? "After import" : "Record needs review"}
      </p>
      {!row.values.length && (
        <p className="text-copy text-muted-foreground">
          Resolve the file’s issues to see the complete proposed record.
        </p>
      )}
      <dl className="grid gap-4 sm:grid-cols-2">
        {row.values.map((value) => (
          <div key={value.field}>
            <dt className="font-medium">{value.field}</dt>
            <dd className="text-copy text-muted-foreground">
              <span>{value.value}</span>
              <small>{value.source}</small>
              {row.status !== "new" &&
                row.changes.find((change) => change.field === value.field) && (
                  <small>
                    Current:{" "}
                    {
                      row.changes.find(
                        (change) => change.field === value.field,
                      )!.before
                    }
                  </small>
                )}
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
      {!row.csvRows.length && (
        <p className="text-caption text-muted-foreground">
          Affected by changes elsewhere in the file.
        </p>
      )}
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
  const restoring = review.people.filter((row) =>
    row.issues.some((issue) => issue.code === "restore-user"),
  ).length;
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
          `${r.name} ${r.secondary} ${r.values.map((value) => value.value).join(" ")} ${r.changes.map((c) => `${c.field} ${c.before} ${c.after}`).join(" ")}`
            .toLowerCase()
            .includes(word),
        ),
    )
    .sort(
      (a, b) =>
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
    .sort((a, b) => a.row - b.row);
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
            <span
              key={key}
              className="inline-flex items-center gap-2 px-2 py-1 text-label"
            >
              {label} <Badge>{counts[key]}</Badge>
            </span>
          ))}
      </ReviewCounts>
      {review.valid && restoring > 0 && (
        <Alert variant="warning">
          {restoring} {restoring === 1 ? "user was" : "users were"} recently
          deleted. Import will restore and reactivate{" "}
          {restoring === 1 ? "their account" : "their accounts"}, removing them
          from Recently deleted.
        </Alert>
      )}
      <TabsList aria-label="Import review sections">
        <TabsTrigger value="people">People {review.people.length}</TabsTrigger>
        <TabsTrigger value="teams">Teams {review.teams.length}</TabsTrigger>
        <TabsTrigger value="issues">
          Issues <Badge>{review.issues.length}</Badge>
        </TabsTrigger>
      </TabsList>
      <CollectionControls
        secondaryRow
        search={
          <FormField label="Search review" visuallyHiddenLabel>
            <Input
              id="roster-import-review-search"
              name="roster-import-review-search"
              type="search"
              placeholder={
                tab === "issues"
                  ? "Search issues"
                  : "Search users, teams or details"
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </FormField>
        }
        sort={
          tab !== "issues" ? (
            <SortPicker
              label="Sort review"
              value={sort}
              onValueChange={(v) => {
                setSort(v);
                setPage(1);
              }}
            >
              <option value="name">{sortLabels.nameAsc}</option>
              <option value="reverse">{sortLabels.nameDesc}</option>
            </SortPicker>
          ) : undefined
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
              <DataTable
                layout={
                  tab === "teams" ? "rosterReviewTeams" : "rosterReviewPeople"
                }
                density="compact"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>{tab === "teams" ? "Team" : "User"}</TableHead>
                    <TableHead>
                      {tab === "teams" ? "Parent team" : "Email"}
                    </TableHead>
                    <TableHead>
                      {tab === "teams" ? "Manager" : "Team"}
                    </TableHead>
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
                          </TableCell>
                          <TableCell>
                            {tab === "teams"
                              ? reviewValue(row, "Parent team")
                              : row.secondary}
                          </TableCell>
                          <TableCell>
                            {reviewValue(
                              row,
                              tab === "teams" ? "Team manager" : "Team",
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
                            <TableCell colSpan={5}>
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
  onChange,
  onImported,
  registerNavigationGuard,
}: {
  data: Workspace;
  production?: boolean;
  disabled?: boolean;
  onChange: (data: Workspace) => void | Promise<void>;
  onImported?: () => Promise<void>;
  registerNavigationGuard?: RegisterNavigationGuard;
}) {
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(0);
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [review, setReview] = useState<RosterReview | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const saving = useRef(false);
  const uncertain = useRef(false);
  const committed = useRef(false);
  const baseline = useRef("");
  const { confirm } = useInteractionDialog();
  const guard = useRef(async () => true);
  guard.current = async () =>
    !saving.current &&
    (!uncertain.current ||
      (await confirm(
        "Close this import? The save may already have completed. Retry Import to confirm it before closing.",
      )));
  useEffect(() => {
    if (!open) return;
    registerNavigationGuard?.(() => guard.current(), {
      protected: applying || uncertain.current,
    });
    const unload = (event: BeforeUnloadEvent) => {
      if (saving.current || uncertain.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      registerNavigationGuard?.(null);
      window.removeEventListener("beforeunload", unload);
    };
  }, [open, applying, error, registerNavigationGuard]);
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
    if (saving.current) return;
    cancel();
    setOpen(false);
    setFile(null);
    setReview(null);
    setError("");
    setStep(0);
    committed.current = false;
    uncertain.current = false;
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
      } else {
        result = reviewRosterCsv(file.csv, data);
        baseline.current = rosterBaseline(data);
      }
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
  async function apply() {
    if (!file || !review?.valid || saving.current || busy) return;
    saving.current = true;
    setApplying(true);
    setError("");
    try {
      if (!committed.current) {
        if (production) {
          uncertain.current = true;
          const response = await fetch("/api/admin/roster-import/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ csv: file.csv, token: review.token }),
          });
          const body = await response.json();
          if (!response.ok) {
            if (response.status === 409 || response.status === 400) {
              uncertain.current = false;
              setReview(null);
              setStep(0);
            }
            throw new Error(
              body.error ||
                "Import could not be confirmed. Retry Import to check the same operation.",
            );
          }
          if (!body.result?.completedAt)
            throw new Error("Import could not be confirmed. Retry Import.");
        } else {
          if (baseline.current !== rosterBaseline(data)) {
            setReview(null);
            setStep(0);
            throw new Error(
              "The organization changed. Review the file again before importing.",
            );
          }
          const prepared = prepareRosterCsv(file.csv, data, {
            stamp: review.reviewedAt,
          });
          if (!prepared.review.valid || !prepared.proposal)
            throw new Error("Fix blocking issues before importing.");
          await onChange(
            materializeRoster(prepared.proposal, prepared.review, () =>
              crypto.randomUUID(),
            ),
          );
        }
        committed.current = true;
        uncertain.current = false;
      }
      try {
        await onImported?.();
      } catch {
        throw new Error(
          "Import saved, but People could not be refreshed. Retry to load the updated roster.",
        );
      }
      saving.current = false;
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      saving.current = false;
      setApplying(false);
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
          if (!value)
            void guard.current().then((allowed) => {
              if (allowed) close();
            });
        }}
      >
        <DialogContent size="workflow-list">
          <DialogTitle>Import people and teams</DialogTitle>
          <DialogDescription>
            Review the changes, then import when you’re ready.
          </DialogDescription>
          <DialogSteps steps={["Upload", "Review"]} current={step} />
          {error && (
            <Alert variant="destructive" role="alert">
              {error}
            </Alert>
          )}
          <DialogBody>
            <ScrollRegion hidden={step !== 0} className="h-full p-1">
              <div className="grid gap-5">
                <p className="text-copy">
                  <a
                    className="text-link underline underline-offset-4"
                    href="/templates/people-import-template.csv"
                    download
                  >
                    Download the template
                  </a>
                  , fill it in, then export it as CSV and choose your file to
                  review. Use one row per user. For a team with no direct
                  members, fill in only the team columns.
                </p>
                <FormField
                  label="CSV file"
                  description={`Up to ${ROSTER_IMPORT_MAX_ROWS.toLocaleString("en-US")} rows per file, excluding the header · 2 MB maximum`}
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
                    existing user or team there.
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
            </ScrollRegion>
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
                    disabled={
                      applying || uncertain.current || committed.current
                    }
                    onClick={() => setStep(0)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={applying}
                    onClick={() =>
                      void guard.current().then((allowed) => {
                        if (allowed) close();
                      })
                    }
                  >
                    Cancel
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
                <Button
                  type="button"
                  disabled={!review?.valid}
                  loading={applying}
                  onClick={() => void apply()}
                >
                  {applying
                    ? "Importing…"
                    : committed.current
                      ? "Reload People"
                      : uncertain.current
                        ? "Retry Import"
                        : "Import"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
