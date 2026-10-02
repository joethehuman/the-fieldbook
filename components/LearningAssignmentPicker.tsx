"use client";
import { useEffect, useRef, useState } from "react";
import type { Workspace } from "@/lib/store";
import type { LearningItem } from "@/lib/types";
import { effectiveGroups, ancestorIds, reportingTeamId } from "@/lib/types";
import {
  assignLearningToAudiences,
  curriculumAudienceSources,
  directlyAssignedAudiences,
  assignmentAudiences,
  audienceKey,
} from "@/lib/assignment-audiences";
import { SaveRecoveryError } from "@/lib/save-recovery";
import {
  isOrganizationChangeCanceled,
  type OrganizationChangeOptions,
} from "@/lib/organization-change";
import { Button } from "./ui/button";
import { Alert } from "./ui/alert";
import { Checkbox } from "./ui/choice";
import { useToast } from "./ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./ui/dialog";
import { DataTable } from "./patterns/data-table";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableContainer,
} from "./ui/table";
import { SearchField } from "./patterns/search-field";
import { Input } from "./ui/input";
import { Pagination } from "./patterns/pagination";
import { useInteractionDialog } from "./ui/interaction-dialog";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";

export function LearningAssignmentPicker({
  data,
  item,
  title,
  onChange,
  registerNavigationGuard,
  onPrepare,
  triggerLabel = "Assign to teams or groups",
  compact = false,
}: {
  onPrepare?: () => Promise<Workspace | null>;
  triggerLabel?: string;
  compact?: boolean;
  data: Workspace;
  item: LearningItem;
  title: string;
  onChange: (
    next: Workspace,
    options?: OrganizationChangeOptions,
  ) => void | Promise<void>;
  registerNavigationGuard?: RegisterNavigationGuard;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stale, setStale] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const initial = useRef<string[]>([]),
    revision = useRef<number | undefined>(undefined),
    snapshot = useRef(""),
    running = useRef(false);
  const { confirm } = useInteractionDialog();
  const notify = useToast();
  const dirty =
    open &&
    JSON.stringify([...selected].sort()) !==
      JSON.stringify([...initial.current].sort());
  const guard = useRef(async () => true);
  guard.current = async () =>
    !running.current &&
    (!dirty || (await confirm("Discard unsaved assignment changes?")));
  useEffect(() => {
    if (!open) return;
    registerNavigationGuard?.(() => guard.current(), {
      protected: dirty || busy,
    });
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty || running.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      registerNavigationGuard?.(null);
      window.removeEventListener("beforeunload", unload);
    };
  }, [open, dirty, busy, registerNavigationGuard]);
  const allAudiences = assignmentAudiences(data);
  const audiences = allAudiences.filter((audience) =>
    `${audience.kind}: ${audience.name}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(audiences.length / 10)),
  );
  const hasPerson = (
    person: Workspace["users"][number],
    audience: (typeof allAudiences)[number],
  ) =>
    audience.kind === "group"
      ? effectiveGroups(person, data.groups, data.teams || []).has(audience.id)
      : ancestorIds(
          reportingTeamId(person.teamId, data.teams || []) || "",
          data.teams || [],
        ).has(audience.id);
  const covered = allAudiences.filter(
    (audience) =>
      selected.includes(audienceKey(audience)) ||
      curriculumAudienceSources(data, audienceKey(audience), item).length > 0,
  );
  const audience = data.users.filter(
    (person) =>
      person.active &&
      covered.some((candidate) => hasPerson(person, candidate)),
  ).length;
  const initialCount = directlyAssignedAudiences(data, item).length;
  const assignmentSnapshot = (workspace: Workspace) =>
    JSON.stringify([
      workspace.groups,
      workspace.teams,
      workspace.users,
      workspace.curricula,
      workspace.content,
      workspace.publishedContent,
      workspace.progress,
      workspace.settings,
      workspace.revision,
      workspace.governanceRevision,
    ]);
  const validateCurrent = () => {
    if (
      dataRef.current.governanceRevision !== revision.current ||
      assignmentSnapshot(dataRef.current) !== snapshot.current
    ) {
      setStale(true);
      throw new Error(
        "Teams, groups, membership or learning changed. Close this dialog and review the current list.",
      );
    }
  };
  async function close() {
    if (await guard.current()) {
      setOpen(false);
      setError("");
    }
  }
  async function save() {
    if (running.current) return;
    if (data.governanceRevision !== revision.current) {
      setStale(true);
      setError(
        "Teams, groups or membership changed. Close this dialog and review the current list.",
      );
      return;
    }
    running.current = true;
    setBusy(true);
    setError("");
    try {
      validateCurrent();
      await onChange(
        assignLearningToAudiences(dataRef.current, [item], selected),
        {
          locallyHandled: true,
          validateCurrent,
          review: {
            title: `Assign ${title}`,
            confirmLabel: "Apply assignments",
            always: true,
          },
        },
      );
      initial.current = selected;
      setOpen(false);
      notify("Assignments saved. Existing history and deadlines preserved.");
    } catch (e) {
      if (!isOrganizationChangeCanceled(e)) {
        if (e instanceof SaveRecoveryError) setStale(true);
        setError((e as Error).message);
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function begin() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setStale(false);
    try {
      const prepared = onPrepare ? await onPrepare() : dataRef.current;
      if (!prepared || !mounted.current) return;
      const ids = directlyAssignedAudiences(prepared, item);
      initial.current = ids;
      revision.current = prepared.governanceRevision;
      snapshot.current = assignmentSnapshot(prepared);
      setSelected(ids);
      setQuery("");
      setPage(1);
      setOpen(true);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <>
      <Button
        type="button"
        variant={compact ? "link" : "outline"}
        size={compact ? "sm" : "default"}
        loading={busy && !open}
        onClick={() => void begin()}
      >
        {triggerLabel}
      </Button>
      {!open && error && <Alert variant="destructive">{error}</Alert>}
      {!compact && (
        <p className="text-sm text-muted-foreground">
          {initialCount} direct{" "}
          {initialCount === 1 ? "audience assignment" : "audience assignments"}
          {item.kind === "course" &&
          allAudiences.some(
            (candidate) =>
              curriculumAudienceSources(data, audienceKey(candidate), item)
                .length,
          )
            ? " · also included through curricula"
            : ""}
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) void close();
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogTitle>Assign to teams or groups</DialogTitle>
          <DialogDescription>
            {title}. Choose which teams or groups receive it directly. Teams
            include their subteams.
            {item.kind === "course"
              ? " Existing curriculum assignments stay attached."
              : ""}
          </DialogDescription>
          {error && <Alert variant="destructive">{error}</Alert>}
          <SearchField>
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search teams or groups"
              aria-label="Find a team or group"
              disabled={busy}
            />
          </SearchField>
          <TableContainer>
            <DataTable
              layout="assignmentGroups"
              aria-label="Team and group assignments"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <span className="sr-only">Assign</span>
                  </TableHead>
                  <TableHead>Team or group</TableHead>
                  <TableHead>People</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audiences
                  .slice((currentPage - 1) * 10, currentPage * 10)
                  .map((candidate) => {
                    const key = audienceKey(candidate);
                    const label = `${candidate.kind === "team" ? "Team" : "Group"}: ${candidate.name}`;
                    const through = curriculumAudienceSources(data, key, item);
                    const parents =
                      candidate.kind === "team"
                        ? allAudiences.filter(
                            (parent) =>
                              parent.kind === "team" &&
                              parent.id !== candidate.id &&
                              ancestorIds(candidate.id, data.teams || []).has(
                                parent.id,
                              ) &&
                              (selected.includes(audienceKey(parent)) ||
                                curriculumAudienceSources(
                                  data,
                                  audienceKey(parent),
                                  item,
                                ).length > 0),
                          )
                        : [];
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <Checkbox
                            aria-label={`Assign directly to ${label}`}
                            disabled={busy}
                            checked={selected.includes(key)}
                            onCheckedChange={(checked) =>
                              setSelected((ids) =>
                                checked === true
                                  ? [...new Set([...ids, key])]
                                  : ids.filter((id) => id !== key),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {label}
                          {!!through.length && (
                            <p className="text-xs text-muted-foreground">
                              Also included through {through.join(", ")}. This
                              course stays assigned through these curricula.
                            </p>
                          )}
                          {!!parents.length && (
                            <p className="text-xs text-muted-foreground">
                              Also included through{" "}
                              {parents
                                .map((parent) => `Team: ${parent.name}`)
                                .join(", ")}
                              . Removing this direct link keeps parent-team
                              assignments.
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {
                            data.users.filter(
                              (person) =>
                                person.active && hasPerson(person, candidate),
                            ).length
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </DataTable>
          </TableContainer>
          {!audiences.length && (
            <p className="text-copy text-muted-foreground">
              {allAudiences.length
                ? "No matching teams or groups."
                : "Create a team or group before assigning learning."}
            </p>
          )}
          <Pagination
            page={currentPage}
            pageSize={10}
            total={audiences.length}
            onPageChange={setPage}
            label="Teams and groups"
          />
          <p className="text-sm text-muted-foreground">
            {selected.length} direct{" "}
            {selected.length === 1 ? "audience" : "audiences"} selected ·{" "}
            {audience} active {audience === 1 ? "person" : "people"} across
            direct and curriculum assignments. Overlapping courses count once.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void close()}
            >
              Cancel
            </Button>
            <Button
              type="button"
              loading={busy}
              disabled={!dirty || stale}
              onClick={() => void save()}
            >
              Review assignments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
