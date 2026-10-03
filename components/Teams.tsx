"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RegisterLandingNavigation } from "@/lib/navigation-guard";
import type { Workspace } from "@/lib/store";
import { reportTeamIds, type User } from "@/lib/types";
import { teamPath } from "@/lib/team-hierarchy";
import { todayUTC, completionPercent } from "@/lib/learning";
import { request, RequestError } from "@/lib/workspace-save";
import {
  emptyProgressFilters,
  filterProgress,
  localProgressDetail,
  progressDetailCsv,
  progressPeople,
  progressPeopleCsv,
  progressSummary,
  statusLabels,
  subteamProgress,
  type ProgressDetail,
  type ProgressFilters,
  type ProgressRow,
} from "@/lib/progress-report";
import { ProgressOverview } from "./patterns/progress-overview";
import {
  CollectionControls,
  CollectionEmpty,
} from "./patterns/collection-controls";
import { HierarchyPicker } from "./patterns/hierarchy-picker";
import { DetailNavigation } from "./patterns/detail-navigation";
import { CsvExport } from "./patterns/csv-export";
import { FormField } from "./patterns/form-field";
import { DataTable } from "./patterns/data-table";
import { Pagination } from "./patterns/pagination";
import { EmptyState, SectionHeader } from "./patterns/layout";
import {
  TableContainer,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "./ui/table";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SelectField } from "./ui/select";
import { Alert } from "./ui/alert";
import { Spinner } from "./ui/spinner";
export { TeamsAdmin } from "./TeamManagement";
export function TeamProgress({
  data: sourceData,
  user,
  registerLandingNavigation,
}: {
  data: Workspace;
  user: User;
  registerLandingNavigation?: RegisterLandingNavigation;
}) {
  const [refreshed, setRefreshed] = useState<{
    source: Workspace;
    data: Workspace;
  } | null>(null);
  const data = refreshed?.source === sourceData ? refreshed.data : sourceData;
  const [refreshing, setRefreshing] = useState(false),
    [reportError, setReportError] = useState(""),
    [accessLost, setAccessLost] = useState(false);
  const [filters, setFilters] = useState<ProgressFilters>({
    ...emptyProgressFilters,
  });
  const [sort, setSort] = useState("name"),
    [page, setPage] = useState(1);
  const [person, setPerson] = useState<ProgressRow | null>(null),
    [detail, setDetail] = useState<ProgressDetail | null>(null),
    [error, setError] = useState("");
  const host = useRef<HTMLDivElement>(null),
    savedScroll = useRef(0),
    detailEpoch = useRef(0);
  const teams = data.teams || [],
    allowed = reportTeamIds(user, teams),
    deadlines = data.settings?.dueDatesEnabled !== false;
  const visibleTeams = teams.filter((t) => allowed.has(t.id));
  const all = useMemo(() => progressPeople(data, user), [data, user]);
  const safeFilters = {
    ...filters,
    team:
      filters.team === "all" || allowed.has(filters.team)
        ? filters.team
        : "all",
    status:
      !deadlines && ["overdue", "within"].includes(filters.status)
        ? "all"
        : filters.status,
  };
  const rows = filterProgress(all, teams, safeFilters, sort);
  const summaryRows = filterProgress(all, teams, {
    ...safeFilters,
    status: "all",
  });
  const summary = progressSummary(summaryRows);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 25)));
  const detailDeadlines = detail?.deadlinesEnabled ?? deadlines;
  const visible = rows.slice((currentPage - 1) * 25, currentPage * 25);
  const scrollOwner = () =>
    host.current?.closest<HTMLElement>(".admin-panel") ||
    host.current?.closest<HTMLElement>(".main-content");
  function back() {
    detailEpoch.current++;
    setPerson(null);
    setDetail(null);
    setError("");
    requestAnimationFrame(() => {
      const owner = scrollOwner();
      if (owner) owner.scrollTop = savedScroll.current;
      host.current
        ?.querySelector<HTMLButtonElement>(`[data-person-id="${person?.u.id}"]`)
        ?.focus({ preventScroll: true });
    });
  }
  useEffect(() => {
    registerLandingNavigation?.({ isCurrent: !person, open: back });
    return () => registerLandingNavigation?.(null);
  });
  useEffect(
    () => () => {
      detailEpoch.current++;
    },
    [],
  );
  function change<K extends keyof ProgressFilters>(
    key: K,
    value: ProgressFilters[K],
  ) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }
  const clear = () => {
    setFilters({ ...emptyProgressFilters });
    setPage(1);
  };
  async function open(row: ProgressRow) {
    if (!person) savedScroll.current = scrollOwner()?.scrollTop || 0;
    setPerson(row);
    setDetail(null);
    setError("");
    const epoch = ++detailEpoch.current;
    requestAnimationFrame(() => {
      const owner = scrollOwner();
      if (owner) owner.scrollTop = 0;
      host.current
        ?.querySelector<HTMLElement>("[data-detail-title]")
        ?.focus({ preventScroll: true });
    });
    try {
      const next = data.progressReport
        ? await request(
            `/api/reports/progress?personId=${encodeURIComponent(row.u.id)}`,
          )
        : localProgressDetail(data, row.u);
      if (epoch === detailEpoch.current) setDetail(next);
    } catch (e) {
      if (epoch === detailEpoch.current) setError((e as Error).message);
    }
  }
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setReportError("");
    try {
      const next = (await request("/api/reports/progress")) as Workspace;
      setRefreshed({ source: sourceData, data: next });
      setAccessLost(false);
    } catch (e) {
      setReportError((e as Error).message);
      if (e instanceof RequestError && [401, 403].includes(e.status))
        setAccessLost(true);
    } finally {
      setRefreshing(false);
    }
  }
  async function peopleCsv() {
    if (!data.progressReport) return progressPeopleCsv(rows, deadlines);
    // Revalidate role/branches and refresh all matching rows before a download.
    const fresh = (await request("/api/reports/progress")) as Workspace;
    const result = progressPeopleCsv(
      filterProgress(
        progressPeople(fresh, user),
        fresh.teams,
        safeFilters,
        sort,
      ),
      fresh.settings?.dueDatesEnabled !== false,
    );
    if (
      JSON.stringify(result) !==
      JSON.stringify(progressPeopleCsv(rows, deadlines))
    )
      throw new Error("The report changed. Refresh it before exporting.");
    return result;
  }
  if (
    !user.active ||
    user.registered === false ||
    !["admin", "manager", "contributor"].includes(user.role)
  )
    return (
      <EmptyState>
        Reporting requires an administrator or manager account.
      </EmptyState>
    );
  const filterLabels: Record<string, string> = {
    query: `Search: ${filters.query}`,
    group:
      data.groups.find((g) => g.id === filters.group)?.name || "Learning group",
    status:
      statusLabels[filters.status as keyof typeof statusLabels] ||
      "Learning status",
    stage: filters.stage,
    started: "Not started",
    signedIn: "Not signed in",
  };
  const applied = Object.entries(filters)
    .filter(([k, v]) => k !== "team" && v !== "all" && v !== "")
    .map(([k]) => ({
      id: k,
      label: filterLabels[k],
      onRemove: () =>
        change(k as keyof ProgressFilters, k === "query" ? "" : "all"),
    }));
  const sorts: Record<string, string> = {
    name: "Name A–Z",
    reverse: "Name Z–A",
    completion: "Completion, lowest first",
    overdue: "Overdue, most first",
  };
  return (
    <div ref={host} className="grid min-w-0 gap-6">
      <div hidden={!!person} className="min-w-0">
        <div className="grid min-w-0 gap-6">
          <SectionHeader
            variant="page"
            title={<h2>People & completion</h2>}
            description="Assigned courses only, using their current published versions. Includes active people who have not signed in."
          >
            {data.progressReport && (
              <Button
                variant="outline"
                disabled={refreshing}
                onClick={() => void refresh()}
              >
                {refreshing ? "Refreshing…" : "Refresh report"}
              </Button>
            )}
            <CsvExport
              filename="team-progress"
              report={peopleCsv}
              disabledReason={
                accessLost
                  ? "Reporting access changed. Refresh the report."
                  : refreshing
                    ? "Wait for the report to refresh."
                    : undefined
              }
            />
          </SectionHeader>
          {reportError && (
            <Alert variant="destructive" role="alert">
              {reportError}
            </Alert>
          )}
          <div hidden={accessLost} className="grid min-w-0 gap-6">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <FormField label="Reporting team">
                <HierarchyPicker
                  searchLabel="Find a reporting team"
                  value={safeFilters.team}
                  onValueChange={(v) => change("team", v)}
                  options={[
                    {
                      id: "all",
                      label:
                        user.role === "admin"
                          ? "Entire organization"
                          : "All my teams",
                      path: [],
                    },
                    ...visibleTeams.map((t) => ({
                      id: t.id,
                      label: t.name,
                      path: teamPath(t.id, visibleTeams).split(" / "),
                    })),
                  ]}
                />
              </FormField>
              <FormField label="Learning group">
                <SelectField
                  value={filters.group}
                  onValueChange={(v) => change("group", v)}
                >
                  <option value="all">All learning groups</option>
                  {data.groups
                    .filter((g) => all.some((r) => r.groupIds.includes(g.id)))
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </SelectField>
              </FormField>
            </div>
            <ProgressOverview
              summary={summary}
              branches={subteamProgress(
                summaryRows,
                visibleTeams,
                safeFilters.team,
              )}
              deadlines={deadlines}
              status={safeFilters.status}
              onStatus={(v) =>
                change("status", safeFilters.status === v ? "all" : v)
              }
              onTeam={(v) => change("team", v)}
            />
            <p className="text-sm text-muted-foreground tabular-nums">
              {summary.completed} of {summary.assignments} course assignments
              complete
              {summary.assignments
                ? ` (${completionPercent(summary.completed, summary.assignments)}%)`
                : ""}
              . Overlapping assignments count once.
            </p>
            <SectionHeader
              title={<h3>People</h3>}
              description="Charts reflect the current people filters. Select a learning status to narrow the table. CSV includes all matching people across pages."
            />
            <CollectionControls
              search={
                <FormField label="Find a team member" visuallyHiddenLabel>
                  <Input
                    type="search"
                    placeholder="Find a team member by name, email or team"
                    value={filters.query}
                    onChange={(e) => change("query", e.target.value)}
                  />
                </FormField>
              }
              filters={applied}
              onClear={clear}
              sortLabel={sorts[sort]}
              sort={
                <FormField label="Sort team members">
                  <SelectField
                    value={sort}
                    onValueChange={(v) => {
                      setSort(v);
                      setPage(1);
                    }}
                  >
                    {Object.entries(sorts)
                      .filter(([k]) => deadlines || k !== "overdue")
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </SelectField>
                </FormField>
              }
            >
              <FormField label="Learning status">
                <SelectField
                  value={safeFilters.status}
                  onValueChange={(v) => change("status", v)}
                >
                  <option value="all">All statuses</option>
                  {[
                    "current",
                    ...(deadlines ? ["within", "overdue"] : ["incomplete"]),
                    "unassigned",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {statusLabels[s as keyof typeof statusLabels]}
                    </option>
                  ))}
                </SelectField>
              </FormField>
              <FormField label="Stage">
                <SelectField
                  value={filters.stage}
                  onValueChange={(v) => change("stage", v)}
                >
                  <option value="all">All stages</option>
                  <option value="New user">Onboarding</option>
                  <option value="Existing user">Existing users</option>
                </SelectField>
              </FormField>
              <FormField label="Course activity">
                <SelectField
                  value={filters.started}
                  onValueChange={(v) => change("started", v)}
                >
                  <option value="all">All activity</option>
                  <option value="not-started">Not started</option>
                </SelectField>
              </FormField>
              <FormField label="Sign-in status">
                <SelectField
                  value={filters.signedIn}
                  onValueChange={(v) => change("signedIn", v)}
                >
                  <option value="all">All people</option>
                  <option value="pending">Not signed in</option>
                </SelectField>
              </FormField>
            </CollectionControls>
            {
              <TableContainer aria-label="People progress">
                <DataTable
                  layout={
                    deadlines ? "progressPeople" : "progressPeopleNoDates"
                  }
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>Person</TableHead>
                      <TableHead>Reporting team</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead align="right">Completion</TableHead>
                      {deadlines && (
                        <TableHead align="right">Overdue</TableHead>
                      )}
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((r) => (
                      <TableRow key={r.u.id}>
                        <TableCell>
                          <strong>{r.u.name}</strong>
                          <small>{r.u.email}</small>
                        </TableCell>
                        <TableCell>{r.team}</TableCell>
                        <TableCell>
                          {r.stage === "New user"
                            ? "Onboarding"
                            : "Existing user"}
                          <small>
                            {r.u.registered === false
                              ? "Not signed in"
                              : "Signed in"}
                          </small>
                        </TableCell>
                        <TableCell align="right">
                          {r.percent === null ? "—" : `${r.percent}%`}
                          <small>
                            {r.completed} of {r.assigned} courses
                          </small>
                          <small>{statusLabels[r.status]}</small>
                        </TableCell>
                        {deadlines && (
                          <TableCell align="right">{r.overdue}</TableCell>
                        )}
                        <TableCell>
                          <Button
                            variant="link"
                            data-person-id={r.u.id}
                            onClick={() => void open(r)}
                          >
                            View courses
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              </TableContainer>
            }
            <CollectionEmpty
              count={rows.length}
              total={all.length}
              noun="people"
              onClear={clear}
            />
            <Pagination
              page={currentPage}
              pageSize={25}
              total={rows.length}
              label="People progress"
              onPageChange={setPage}
            />
          </div>
        </div>
      </div>
      {person && (
        <div className="grid min-w-0 gap-6">
          <DetailNavigation
            items={[{ label: "Back to people & completion", onSelect: back }]}
            current={person.u.name}
          />
          <SectionHeader
            variant="page"
            title={
              <h2 data-detail-title tabIndex={-1}>
                {person.u.name}’s assignments
              </h2>
            }
            description={`${person.team} · ${person.u.email}`}
          >
            <CsvExport
              filename={`${person.u.name}-assignments`}
              disabledReason={
                !detail
                  ? "Assignments must finish loading before export."
                  : undefined
              }
              report={async () => {
                const fresh = data.progressReport
                  ? ((await request(
                      `/api/reports/progress?personId=${encodeURIComponent(person.u.id)}`,
                    )) as ProgressDetail)
                  : detail!;
                const result = progressDetailCsv(
                  fresh,
                  person,
                  fresh.deadlinesEnabled ?? deadlines,
                );
                if (
                  JSON.stringify(result) !==
                  JSON.stringify(
                    progressDetailCsv(
                      detail!,
                      person,
                      detail?.deadlinesEnabled ?? deadlines,
                    ),
                  )
                )
                  throw new Error(
                    "Assignments changed. Reopen them before exporting.",
                  );
                return result;
              }}
            />
          </SectionHeader>
          {error ? (
            <Alert variant="destructive" role="alert">
              <p>{error}</p>
              <Button variant="outline" onClick={() => void open(person)}>
                Retry assignments
              </Button>
            </Alert>
          ) : !detail ? (
            <p role="status" className="flex items-center gap-2">
              <Spinner />
              Loading assignments…
            </p>
          ) : detail.courses.length ? (
            <TableContainer aria-label="Person course assignments">
              <DataTable layout="progressAssignments">
                <TableHeader>
                  <TableRow>
                    <TableHead>Course</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      {detailDeadlines ? "Due date" : "Assigned"}
                    </TableHead>
                    <TableHead>Assigned through</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.courses.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <strong>{c.title}</strong>
                        <small>
                          {c.category} · v{c.version}
                        </small>
                      </TableCell>
                      <TableCell>
                        {c.complete
                          ? "Complete"
                          : detailDeadlines &&
                              c.dueDate &&
                              c.dueDate < (detail.asOf || todayUTC())
                            ? "Overdue"
                            : "Incomplete"}
                      </TableCell>
                      <TableCell>
                        {(detailDeadlines
                          ? c.dueDate
                          : c.assignedAt?.slice(0, 10)) || "—"}
                      </TableCell>
                      <TableCell>
                        {c.sources.join(", ") || "Direct assignment"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            </TableContainer>
          ) : (
            <EmptyState>No assigned courses.</EmptyState>
          )}
        </div>
      )}
    </div>
  );
}
