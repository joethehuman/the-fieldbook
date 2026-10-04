"use client";
import { sortLabels } from "@/lib/collection-sort";
import { SortPicker } from "./patterns/sort-picker";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RegisterLandingNavigation } from "@/lib/navigation-guard";
import type { Workspace } from "@/lib/store";
import { reportTeamIds, type User } from "@/lib/types";
import { teamPath } from "@/lib/team-hierarchy";
import { todayUTC } from "@/lib/learning";
import { request, RequestError } from "@/lib/workspace-save";
import {
  emptyProgressFilters,
  filterProgress,
  filterProgressAssignments,
  localProgressDetail,
  progressDetailCsv,
  progressPeople,
  progressPeopleCsv,
  progressSummary,
  statusLabels,
  type ProgressDetail,
  type ProgressFilters,
  type ProgressRow,
} from "@/lib/progress-report";
import { ProgressOverview } from "./patterns/progress-overview";
import {
  CollectionControls,
  CollectionEmpty,
} from "./patterns/collection-controls";
import { compactHierarchyPath } from "./patterns/hierarchy-picker";
import {
  GroupedSearch,
  type GroupedSearchOption,
} from "./patterns/grouped-search";
import { DetailNavigation } from "./patterns/detail-navigation";
import { CsvExport } from "./patterns/csv-export";
import { FormField } from "./patterns/form-field";
import { RecordName, RecordMeta, RecordProgress } from "./patterns/record-row";
import { RowActions } from "./patterns/row-actions";
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
import { SelectField } from "./ui/select";
import { Input } from "./ui/input";
import { Alert } from "./ui/alert";
import { Spinner } from "./ui/spinner";
export { TeamsAdmin } from "./TeamManagement";
export function TeamProgress({
  data: sourceData,
  user,
  registerLandingNavigation,
  initialPerson,
  onDestinationChange,
}: {
  initialPerson?: string;
  onDestinationChange?: (id?: string) => Promise<boolean>;
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
  const [assignmentFilters, setAssignmentFilters] = useState({
    query: "",
    status: "all",
    sort: "newest",
  });
  const clearAssignmentFilters = () =>
    setAssignmentFilters((current) => ({
      ...current,
      query: "",
      status: "all",
    }));
  const assignmentSortLabels: Record<string, string> = {
    newest: sortLabels.assignedNewest,
    oldest: sortLabels.assignedOldest,
    name: sortLabels.titleAsc,
    reverse: sortLabels.titleDesc,
    "due-earliest": sortLabels.dueEarliest,
    "due-latest": sortLabels.dueLatest,
  };
  const host = useRef<HTMLDivElement>(null),
    savedScroll = useRef(0),
    detailEpoch = useRef(0),
    returnToPerson = useRef<string | null>(null);
  const teams = data.teams || [],
    allowed = reportTeamIds(user, teams),
    deadlines = data.settings?.dueDatesEnabled !== false;
  const visibleTeams = teams.filter((t) => allowed.has(t.id));
  const organization = visibleTeams.find((t) => t.system === "organization");
  const topTeams = visibleTeams.filter(
    (team) =>
      team.system !== "organization" &&
      !visibleTeams.some(
        (parent) =>
          parent.id === team.parentId && parent.system !== "organization",
      ),
  );
  const defaultTeam =
    organization || (topTeams.length === 1 ? topTeams[0] : undefined);
  const defaultLabel =
    defaultTeam?.name ||
    (user.role === "admin" ? "Organization" : "All my teams");
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
  const rows = filterProgress(all, teams, safeFilters,
    !deadlines && sort.startsWith("overdue") ? "name" : sort);
  const summaryRows = filterProgress(all, teams, {
    ...safeFilters,
    status: "all",
  });
  const summary = progressSummary(summaryRows);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 25)));
  const detailDeadlines = detail?.deadlinesEnabled ?? deadlines;
  const safeAssignmentFilters = {
    ...assignmentFilters,
    sort:
      !detailDeadlines && assignmentFilters.sort.startsWith("due-")
        ? "newest"
        : assignmentFilters.sort,
    status:
      !detailDeadlines && assignmentFilters.status === "overdue"
        ? "all"
        : assignmentFilters.status,
  };
  const visibleAssignments = detail
    ? filterProgressAssignments(detail, safeAssignmentFilters, detailDeadlines)
    : null;
  const visible = rows.slice((currentPage - 1) * 25, currentPage * 25);
  const scrollOwner = () =>
    host.current?.closest<HTMLElement>(".admin-panel") ||
    host.current?.closest<HTMLElement>(".main-content");
  // Restore before paint, without stealing focus from a later search interaction.
  useLayoutEffect(() => {
    if (person || !returnToPerson.current) return;
    const personId = returnToPerson.current;
    returnToPerson.current = null;
    const owner = scrollOwner();
    if (owner) owner.scrollTop = savedScroll.current;
    host.current
      ?.querySelector<HTMLButtonElement>(`[data-person-id="${personId}"]`)
      ?.focus({ preventScroll: true });
  }, [person]);
  function back(restoring = false) {
    if (onDestinationChange && !restoring) {
      void onDestinationChange();
      return;
    }
    detailEpoch.current++;
    returnToPerson.current = person?.u.id || null;
    setPerson(null);
    setDetail(null);
    setError("");
  }
  useEffect(() => {
    registerLandingNavigation?.({ isCurrent: !person, open: () => back() });
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
  useEffect(() => {
    if (!initialPerson) {
      if (onDestinationChange && person) back(true);
      return;
    }
    const row = all.find((entry) => entry.u.id === initialPerson);
    if (row) void open(row, true);
  }, [initialPerson]);
  async function open(row: ProgressRow, restoring = false) {
    if (onDestinationChange && !restoring) {
      await onDestinationChange(row.u.id);
      return;
    }
    if (!person) savedScroll.current = scrollOwner()?.scrollTop || 0;
    if (person?.u.id !== row.u.id)
      setAssignmentFilters({ query: "", status: "all", sort: "newest" });
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
        fresh.settings?.dueDatesEnabled === false && sort.startsWith("overdue")
          ? "name"
          : sort,
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
    query: `People matching: ${filters.query}`,
    team: `Team: ${visibleTeams.find((team) => team.id === safeFilters.team)?.name || defaultLabel}`,
    personId: `User: ${all.find((row) => row.u.id === filters.personId)?.u.name || "Selected user"}`,
    group: `Group: ${data.groups.find((g) => g.id === filters.group)?.name || "Learning group"}`,
    status:
      statusLabels[filters.status as keyof typeof statusLabels] ||
      "Learning status",
    stage: `User type: ${filters.stage}`,
    started: "Not started",
  };
  const applied = Object.entries(filters)
    .filter(([, v]) => v !== "all" && v !== "")
    .map(([k]) => ({
      id: k,
      label: filterLabels[k],
      onRemove: () =>
        change(k as keyof ProgressFilters, k === "query" ? "" : "all"),
    }));
  const selectedPerson = all.find((row) => row.u.id === filters.personId);
  const scopeLabel =
    filters.personId !== "all"
      ? selectedPerson?.u.name || "Selected user"
      : safeFilters.team === "all"
        ? defaultLabel
        : visibleTeams.find((team) => team.id === safeFilters.team)?.name ||
          defaultLabel;
  const chartFilters = [
    filters.group !== "all" &&
      (data.groups.find((group) => group.id === filters.group)?.name ||
        "Selected learning group"),
    filters.stage !== "all" && filters.stage,
    filters.started !== "all" && "Not started",
    filters.query && `Matching “${filters.query}”`,
  ].filter(Boolean);
  const scopeDescription =
    filters.personId !== "all"
      ? `${scopeLabel}’s assigned course progress.`
      : `${scopeLabel} · ${summary.people} ${summary.people === 1 ? "user" : "users"}. ${organization && safeFilters.team === "all" ? "Every team, including people without a team." : "Includes all subteams."}`;
  const searchOptions: GroupedSearchOption[] = [
    {
      id: "team:all",
      group: "Teams",
      label: defaultLabel,
      description: organization
        ? "All teams and people without a team"
        : defaultTeam
          ? "This team and all its subteams"
          : "All teams you manage",
    },
    ...visibleTeams
      .filter(
        (team) => team.id !== defaultTeam?.id && team.system !== "organization",
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((team) => ({
        id: `team:${team.id}`,
        group: "Teams",
        label: team.name,
        description: compactHierarchyPath(
          teamPath(team.id, visibleTeams).split(" / "),
        ),
        keywords: teamPath(team.id, visibleTeams),
      })),
    ...[...all]
      .sort((a, b) => a.u.name.localeCompare(b.u.name))
      .map((row) => ({
        id: `person:${row.u.id}`,
        group: "People",
        label: row.u.name,
        description: `${row.u.email} · ${row.team}`,
      })),
  ];
  function changeTeam(team: string) {
    setFilters((current) => ({ ...current, team, query: "", personId: "all" }));
    setPage(1);
  }
  function selectSearch(id: string) {
    if (id.startsWith("team:")) changeTeam(id.slice(5));
    else if (id.startsWith("person:")) {
      setFilters({ ...emptyProgressFilters, personId: id.slice(7) });
      setPage(1);
    } else if (id.startsWith("query:")) {
      setFilters((current) => ({
        ...current,
        personId: "all",
        query: id.slice(6),
      }));
      setPage(1);
    }
  }
  const sorts: Record<string, string> = {
    name: sortLabels.nameAsc,
    reverse: sortLabels.nameDesc,
    completion: sortLabels.completionLowest,
    "completion-highest": sortLabels.completionHighest,
    overdue: sortLabels.pastDueMost,
    "overdue-fewest": sortLabels.pastDueFewest,
  };
  return (
    <div ref={host} className="grid min-w-0 gap-6">
      <div hidden={!!person} className="min-w-0">
        <div className="grid min-w-0 gap-6">
          <SectionHeader
            variant="page"
            title={<h2>Progress</h2>}
            description="Track assigned course completion across your teams."
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
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {scopeDescription}{" "}
              {chartFilters.length > 0 &&
                `Filtered to: ${chartFilters.join(" · ")}.`}
            </p>
            <ProgressOverview
              summary={summary}
              deadlines={deadlines}
              status={safeFilters.status}
              onStatus={(value) =>
                change("status", safeFilters.status === value ? "all" : value)
              }
            />
            <CollectionControls
              animateFilterChanges
              search={
                <FormField label="Search teams or people" visuallyHiddenLabel>
                  <GroupedSearch
                    placeholder="Search teams or people"
                    options={searchOptions}
                    onSelect={selectSearch}
                    queryAction={(query) => {
                      const count = filterProgress(all, teams, {
                        ...safeFilters,
                        personId: "all",
                        query,
                      }).length;
                      return {
                        id: `query:${query}`,
                        group: "People",
                        label: "Show matching people",
                        description: `${count} ${count === 1 ? "user" : "users"} in ${safeFilters.team === "all" ? defaultLabel : visibleTeams.find((team) => team.id === safeFilters.team)?.name || defaultLabel}`,
                      };
                    }}
                  />
                </FormField>
              }
              filters={applied}
              onClear={clear}
              sort={
                <SortPicker
                  label="Sort team members"
                  value={!deadlines && sort.startsWith("overdue") ? "name" : sort}
                  onValueChange={(v) => {
                    setSort(v);
                    setPage(1);
                  }}
                >
                  {Object.entries(sorts)
                    .filter(([k]) => deadlines || !k.startsWith("overdue"))
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </SortPicker>
              }
            >
              <FormField
                label="Learning group"
                description="Only people in this group and the selected team. Completion still includes all their assigned courses."
              >
                <SelectField
                  value={filters.group}
                  onValueChange={(v) => change("group", v)}
                >
                  <option value="all">All groups</option>
                  {data.groups
                    .filter((g) => all.some((r) => r.groupIds.includes(g.id)))
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </SelectField>
              </FormField>
              <FormField
                label="Learning status"
                description="Narrows the people list; the overview keeps all statuses for comparison."
              >
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
              <FormField label="User type">
                <SelectField
                  value={filters.stage}
                  onValueChange={(v) => change("stage", v)}
                >
                  <option value="all">All user types</option>
                  <option value="New user">New users</option>
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
            </CollectionControls>
            <SectionHeader title={<h3>People</h3>} />
            {
              <TableContainer aria-label="People progress">
                <DataTable
                  density="compact"
                  layout={
                    deadlines ? "progressPeople" : "progressPeopleNoDates"
                  }
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Reporting team</TableHead>
                      <TableHead>User type</TableHead>
                      <TableHead>Completion</TableHead>
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
                          <RecordName
                            data-person-id={r.u.id}
                            onClick={() => void open(r)}
                          >
                            {r.u.name}
                          </RecordName>
                          <RecordMeta title={r.u.email}>{r.u.email}</RecordMeta>
                        </TableCell>
                        <TableCell>{r.team}</TableCell>
                        <TableCell>{r.stage}</TableCell>
                        <TableCell>
                          <RecordProgress
                            percent={r.percent}
                            completed={r.completed}
                            assigned={r.assigned}
                            status={statusLabels[r.status]}
                            overdue={deadlines ? r.overdue : 0}
                          />
                        </TableCell>
                        {deadlines && (
                          <TableCell align="right">{r.overdue}</TableCell>
                        )}
                        <TableCell>
                          <RowActions
                            label={r.u.name}
                            actions={[
                              {
                                label: "View courses",
                                onSelect: () => void open(r),
                              },
                            ]}
                          />
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
            items={[{ label: "Back to progress", onSelect: () => back() }]}
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
                return progressDetailCsv(
                  filterProgressAssignments(
                    fresh,
                    safeAssignmentFilters,
                    fresh.deadlinesEnabled ?? deadlines,
                  ),
                  person,
                  fresh.deadlinesEnabled ?? deadlines,
                );
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
            <>
              <CollectionControls
                search={
                  <FormField label="Search courses" visuallyHiddenLabel>
                    <Input
                      type="search"
                      placeholder="Search courses"
                      value={assignmentFilters.query}
                      onChange={(event) =>
                        setAssignmentFilters((current) => ({
                          ...current,
                          query: event.target.value,
                        }))
                      }
                    />
                  </FormField>
                }
                sort={
                  <SortPicker
                    label="Sort assignments"
                    value={safeAssignmentFilters.sort}
                    onValueChange={(sort) =>
                      setAssignmentFilters((current) => ({
                        ...current,
                        sort,
                      }))
                    }
                  >
                    {Object.entries(assignmentSortLabels)
                      .filter(([value]) => detailDeadlines || !value.startsWith("due-"))
                      .map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                  </SortPicker>
                }
                filters={[
                  ...(assignmentFilters.query
                    ? [
                        {
                          id: "query",
                          label: `Search: ${assignmentFilters.query}`,
                          onRemove: () =>
                            setAssignmentFilters((current) => ({
                              ...current,
                              query: "",
                            })),
                        },
                      ]
                    : []),
                  ...(safeAssignmentFilters.status !== "all"
                    ? [
                        {
                          id: "status",
                          label:
                            safeAssignmentFilters.status === "complete"
                              ? "Complete"
                              : safeAssignmentFilters.status === "overdue"
                                ? "Overdue"
                                : "Incomplete",
                          onRemove: () =>
                            setAssignmentFilters((current) => ({
                              ...current,
                              status: "all",
                            })),
                        },
                      ]
                    : []),
                ]}
                onClear={clearAssignmentFilters}
              >
                <FormField label="Course status">
                  <SelectField
                    value={safeAssignmentFilters.status}
                    onValueChange={(status) =>
                      setAssignmentFilters((current) => ({
                        ...current,
                        status,
                      }))
                    }
                  >
                    <option value="all">All statuses</option>
                    <option value="complete">Complete</option>
                    <option value="incomplete">Incomplete</option>
                    {detailDeadlines && (
                      <option value="overdue">Overdue</option>
                    )}
                  </SelectField>
                </FormField>
              </CollectionControls>
              <p className="text-xs text-muted-foreground" role="status">
                {visibleAssignments!.courses.length} of {detail.courses.length}{" "}
                {detail.courses.length === 1 ? "course" : "courses"}
              </p>
              <TableContainer aria-label="User course assignments">
                <DataTable density="compact" layout="progressAssignments">
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
                    {visibleAssignments!.courses.map((c) => (
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
              <CollectionEmpty
                count={visibleAssignments!.courses.length}
                total={detail.courses.length}
                noun="courses"
                onClear={clearAssignmentFilters}
              />
            </>
          ) : (
            <EmptyState>No assigned courses.</EmptyState>
          )}
        </div>
      )}
    </div>
  );
}
