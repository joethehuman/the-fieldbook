"use client";
import { useEffect, useRef, useState } from "react";
import type { Workspace } from "@/lib/store";
import type { LearningItem } from "@/lib/types";
import { effectiveGroups } from "@/lib/types";
import {
  assignLearningToGroups,
  curriculumSources,
  directlyAssignedGroups,
} from "@/lib/group-assignment";
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

export function LearningGroupAssignments({
  data,
  item,
  title,
  onChange,
  registerNavigationGuard,
  onOpenGroup,
  onPrepare,
  triggerLabel = "Assign to learning groups",
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
  onOpenGroup?: (id: string) => void | Promise<void>;
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
  const groups = data.groups
    .filter((g) => g.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(groups.length / 10)),
  );
  const effectiveSelected = new Set(
    data.groups
      .filter(
        (g) =>
          selected.includes(g.id) ||
          curriculumSources(data, g.id, item).length > 0,
      )
      .map((g) => g.id),
  );
  const audience = data.users.filter(
    (u) =>
      u.active &&
      [...effectiveGroups(u, data.groups, data.teams || [])].some((id) =>
        effectiveSelected.has(id),
      ),
  ).length;
  const initialCount = directlyAssignedGroups(data, item).length;
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
        "Groups or membership changed. Close this dialog and review the current list.",
      );
      return;
    }
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await onChange(assignLearningToGroups(data, item, selected), {
        review: { title: `Assign ${title}`, confirmLabel: "Apply assignments" },
      });
      initial.current = selected;
      setOpen(false);
      notify("Learning-group assignments saved.");
    } catch (e) {
      if (!isOrganizationChangeCanceled(e)) setError((e as Error).message);
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
      const ids = directlyAssignedGroups(prepared, item);
      initial.current = ids;
      revision.current = prepared.governanceRevision;
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
          {initialCount === 1 ? "group assignment" : "group assignments"}
          {item.kind === "course" &&
          data.groups.some((g) => curriculumSources(data, g.id, item).length)
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
          <DialogTitle>Assign to learning groups</DialogTitle>
          <DialogDescription>
            {title}. Choose which groups receive it directly.
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
              placeholder="Search learning groups"
              aria-label="Find a learning group"
              disabled={busy}
            />
          </SearchField>
          <TableContainer>
            <DataTable
              layout="assignmentGroups"
              aria-label="Learning-group assignments"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <span className="sr-only">Assign</span>
                  </TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>People</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups
                  .slice((currentPage - 1) * 10, currentPage * 10)
                  .map((group) => {
                    const through = curriculumSources(data, group.id, item);
                    return (
                      <TableRow key={group.id}>
                        <TableCell>
                          <Checkbox
                            aria-label={`Assign directly to ${group.name}`}
                            disabled={busy}
                            checked={selected.includes(group.id)}
                            onCheckedChange={(checked) =>
                              setSelected((ids) =>
                                checked === true
                                  ? [...new Set([...ids, group.id])]
                                  : ids.filter((id) => id !== group.id),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {group.name}
                          {!!through.length && (
                            <p className="text-xs text-muted-foreground">
                              Also included through {through.join(", ")}. This
                              course stays assigned through these curricula.
                            </p>
                          )}
                          {onOpenGroup && (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              disabled={busy}
                              onClick={async () => {
                                if (await guard.current()) {
                                  setOpen(false);
                                  await onOpenGroup(group.id);
                                }
                              }}
                            >
                              Open group learning
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          {
                            data.users.filter(
                              (u) =>
                                u.active &&
                                effectiveGroups(
                                  u,
                                  data.groups,
                                  data.teams || [],
                                ).has(group.id),
                            ).length
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </DataTable>
          </TableContainer>
          {!groups.length && (
            <p className="text-copy text-muted-foreground">
              {data.groups.length
                ? "No matching groups."
                : "Create a learning group before assigning learning."}
            </p>
          )}
          <Pagination
            page={currentPage}
            pageSize={10}
            total={groups.length}
            onPageChange={setPage}
            label="Learning groups"
          />
          <p className="text-sm text-muted-foreground">
            {selected.length} direct{" "}
            {selected.length === 1 ? "group" : "groups"} selected · {audience}{" "}
            active {audience === 1 ? "person" : "people"} across direct and
            curriculum assignments. Overlapping courses count once.
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
