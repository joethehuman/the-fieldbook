"use client";

import { BulkActions, type BulkCommand } from "./patterns/bulk-actions";
import { Checkbox } from "./ui/choice";
import { SelectRows, useBulkSelection } from "./patterns/bulk-selection";
import { BulkPicker } from "./patterns/bulk-selection";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MoreHorizontal, Plus } from "lucide-react";
import type { Workspace } from "@/lib/store";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import { ancestorIds, canParent, type Team, type User } from "@/lib/types";
import {
  moveTeam,
  teamMoveImpact,
  teamPath,
  teamDeletionBlockers,
} from "@/lib/team-hierarchy";
import { HierarchyList } from "./patterns/hierarchy-list";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SelectField } from "./ui/select";
import { Badge } from "./ui/badge";
import { Alert } from "./ui/alert";
import { FieldGroup } from "./ui/field";
import { ActionGroup } from "./ui/action-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import {
  TableContainer,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "./ui/table";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { useToast } from "./ui/toast";
import { DataTable } from "./patterns/data-table";
import { FormField } from "./patterns/form-field";
import { FilterBar, SectionHeader, EmptyState } from "./patterns/layout";
import { SettingsSection } from "./patterns/settings-section";
import { Pagination } from "./patterns/pagination";
import { SearchableSelectionList } from "./patterns/searchable-selection-list";
import { useRevealTarget } from "./patterns/use-reveal-target";
import { groupPath } from "@/lib/group-hierarchy";

const PAGE_SIZE = 25;
const byName = (
  a: { name: string; id: string },
  b: { name: string; id: string },
) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

export function TeamsAdmin({
  data,
  onChange,
  registerNavigationGuard,
}: {
  data: Workspace;
  onChange: (data: Workspace) => void | Promise<void>;
  registerNavigationGuard?: RegisterNavigationGuard;
}) {
  const teams = data.teams || [];
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState("members");
  const [query, setQuery] = useState("");
  const [includeSubteams, setIncludeSubteams] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Team | null>(null);
  const baseline = useRef<Team | null>(null);
  const [moving, setMoving] = useState<{
    mode: "into" | "out";
    id: string;
    choice: string | null;
    snapshot?: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const notify = useToast();
  const { confirm } = useInteractionDialog();
  const destination = useRevealTarget<HTMLElement>();
  const memberList = useRevealTarget<HTMLHeadingElement>();
  const team = teams.find((t) => t.id === selected);
  const dirty =
    moving?.choice != null ||
    (!!editing && JSON.stringify(editing) !== JSON.stringify(baseline.current));
  const guard = useRef(async () => true);
  guard.current = async () =>
    !saving.current &&
    (!dirty || (await confirm("Discard unsaved team changes?")));
  useEffect(() => {
    registerNavigationGuard?.(() => guard.current());
    return () => registerNavigationGuard?.(null);
  }, [registerNavigationGuard]);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (dirty || saving.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function resetDraft() {
    setMoving(null);
    setEditing(null);
    setNotice("");
  }
  async function openTeam(id: string) {
    if (!(await guard.current())) return;
    resetDraft();
    setSelected(id);
    setTab("members");
    setQuery("");
    setPage(1);
    setIncludeSubteams(false);
    destination.reveal();
  }
  async function editTeam(value: Team) {
    if (!(await guard.current())) return;
    resetDraft();
    baseline.current = { ...value };
    setEditing({ ...value });
  }
  async function closeEditor() {
    if (await guard.current()) {
      setEditing(null);
      setNotice("");
    }
  }
  async function commit(next: Workspace, message: string, propagate = false) {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setNotice("");
    try {
      await onChange(next);
      notify(message);
      return true;
    } catch (error) {
      if (propagate) throw error;
      setNotice(
        error instanceof Error ? error.message : "Could not save. Try again.",
      );
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function saveTeam(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || saving.current) return;
    const name = editing.name.trim();
    if (
      !name ||
      teams.some(
        (t) =>
          t.id !== editing.id && t.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setNotice("Use a unique team name.");
      return;
    }
    if (!canParent(editing.id, editing.parentId || "", teams)) {
      setNotice("A team cannot sit inside itself or one of its subteams.");
      return;
    }
    const created = !teams.some((t) => t.id === editing.id);
    if (
      await commit(
        {
          ...data,
          teams: [
            ...teams.filter((t) => t.id !== editing.id),
            {
              ...editing,
              name,
              parentId: created
                ? editing.parentId
                : teams.find((item) => item.id === editing.id)?.parentId,
            },
          ],
        },
        "Team saved.",
      )
    ) {
      setEditing(null);
      if (created) {
        setSelected(editing.id);
        setTab("members");
        setQuery("");
        setPage(1);
      }
      destination.reveal();
    }
  }
  async function startMove(mode: "into" | "out", id: string) {
    if (!(await guard.current())) return;
    resetDraft();
    setMoving({ mode, id, choice: null });
    destination.reveal();
  }
  const moveSource = moving?.mode === "into" ? moving.choice : moving?.id;
  const moveParent = moving?.mode === "into" ? moving.id : moving?.choice;
  let impact: ReturnType<typeof teamMoveImpact> | undefined;
  let moveError = "";
  if (moving?.choice != null && moveSource && moveParent != null) {
    try {
      impact = teamMoveImpact(data, moveSource, moveParent);
    } catch (error) {
      moveError =
        error instanceof Error ? error.message : "Choose a valid destination.";
    }
  }
  async function applyMove() {
    if (
      !moving?.snapshot ||
      !moveSource ||
      moveParent == null ||
      saving.current
    )
      return;
    if (moving.snapshot !== JSON.stringify([data.teams, data.users])) {
      setMoving({ ...moving, snapshot: undefined });
      setNotice(
        "Teams or people changed. Review the move again before applying it.",
      );
      return;
    }
    try {
      const next = moveTeam(teams, moveSource, moveParent);
      if (
        await commit(
          { ...data, teams: next },
          "Team moved. Reporting hierarchy updated.",
        )
      ) {
        resetDraft();
        setTab("subteams");
        destination.reveal();
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not move team.",
      );
    }
  }
  async function deleteTeam(value: Team) {
    if (!(await guard.current())) return;
    resetDraft();
    const blockers = teamDeletionBlockers(data, value.id);
    const reasons = [
      blockers.members.length &&
        `${blockers.members.length} direct members (including inactive accounts)`,
      blockers.pending.length &&
        `${blockers.pending.length} pending accounts in People`,
      blockers.children.length &&
        `${blockers.children.length} immediate subteams`,
      blockers.groups.length &&
        `learning-group links: ${blockers.groups.map((group) => group.name).join(", ")}`,
    ].filter(Boolean);
    if (reasons.length) {
      setNotice(
        `Cannot delete ${value.name}: it still has ${reasons.join("; ")}. Move or remove these links first. To keep the team but detach it, use Move team → Top-level team.`,
      );
      destination.reveal();
      return;
    }
    if (
      !(await confirm(
        `Delete empty team “${value.name}”? This permanently removes the team. To keep it and only remove its parent, cancel and use Move team → Top-level team.`,
      ))
    )
      return;
    if (
      await commit(
        { ...data, teams: teams.filter((item) => item.id !== value.id) },
        "Empty team deleted.",
      )
    ) {
      setSelected("");
      destination.reveal();
    }
  }
  async function removeMember(user: User) {
    if (!team || user.teamId !== team.id || saving.current) return;
    if (
      !(await confirm(
        `Remove ${user.name} from ${team.name}? Their account and saved progress are kept. Team-linked learning assignments may change.`,
      ))
    )
      return;
    if (
      await commit(
        {
          ...data,
          users: data.users.map((u) =>
            u.id === user.id ? { ...u, teamId: undefined } : u,
          ),
        },
        "Member removed from team.",
      )
    )
      memberList.reveal();
  }
  const direct = data.users.filter((u) => u.teamId === selected);
  const descendants = new Set(
    teams
      .filter(
        (t) => t.id !== selected && ancestorIds(t.id, teams).has(selected),
      )
      .map((t) => t.id),
  );
  const descendantMembers = data.users.filter(
    (u) => !!u.teamId && descendants.has(u.teamId),
  );
  const members = [...direct, ...(includeSubteams ? descendantMembers : [])]
    .filter((u) =>
      `${u.name} ${u.email}`.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort(byName);
  const children = teams.filter((t) => t.parentId === selected).sort(byName);
  const rosterSelection = useBulkSelection(
    selected + tab + query + includeSubteams,
    members.map((u) => u.id),
    members.filter((u) => u.teamId === team?.id).map((u) => u.id),
  );
  const teamSelection = useBulkSelection(
    selected,
    teams.map((t) => t.id),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(members.length / PAGE_SIZE)),
  );
  const eligible = data.users
    .filter((u) => u.active && u.teamId !== selected)
    .sort(byName);
  const teamName = (id?: string) =>
    (id ? teamPath(id, teams) : "No team");

  function teamTable(rows: Team[]) {
    return rows.length ? (
      <TableContainer>
        <DataTable layout="teams" aria-label={team ? "Subteams" : "Teams"}>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead align="right">Direct members</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <strong>{t.name}</strong>
                </TableCell>
                <TableCell>{t.parentId ? teamName(t.parentId) : "—"}</TableCell>
                <TableCell>
                  {data.users.find((u) => u.id === t.managerId)?.name ||
                    "Unassigned"}
                </TableCell>
                <TableCell align="right">
                  {data.users.filter((u) => u.teamId === t.id).length}
                </TableCell>
                <TableCell>
                  <Button
                    variant="link"
                    disabled={busy}
                    onClick={() => void openTeam(t.id)}
                    aria-label={`Manage ${t.name}`}
                  >
                    Manage team
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </TableContainer>
    ) : (
      <EmptyState>
        {team
          ? "No subteams. Add one to organize a separate reporting team beneath this team."
          : "No teams yet. Add a team to organize reporting and membership."}
      </EmptyState>
    );
  }

  return (
    <section
      {...destination.targetProps}
      aria-label={team ? `${team.name} management` : "Teams"}
      className="grid min-w-0 gap-6"
    >
      {!team ? (
        <>
          <SectionHeader
            title={<h2>Teams</h2>}
            description="Organize reporting teams, managers and membership."
          />

          <HierarchyList
            searchAction={
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void editTeam({ id: crypto.randomUUID(), name: "" })
                }
              >
                <Plus aria-hidden="true" />
                Add team
              </Button>
            }
            selectionActions={
              <BulkActions
                singleItemActions={false}
                collectionSize={teamSelection.collectionSize}
                selected={teamSelection.actionIds}
                onSelectionChange={teamSelection.setSelected}
                noun="teams"
                commands={[...([true, false] as const).map((add) => ({
                  id: add ? "add-groups" : "remove-groups",
                  label: add
                    ? "Add to learning groups"
                    : "Remove from learning groups",
                  description:
                    "Change direct team links. Subteams are not included automatically. People and saved progress are preserved.",
                  options: data.groups.map((g) => ({
                    id: g.id,
                    label: groupPath(g.id, data.groups),
                  })),
                  apply: async (ids: string[]) => {
                    if (
                      !(await commit(
                        {
                          ...data,
                          groups: data.groups.map((g) =>
                            ids.includes(g.id)
                              ? {
                                  ...g,
                                  teamIds: add
                                    ? [
                                        ...new Set([
                                          ...(g.teamIds || []),
                                          ...teamSelection.actionIds,
                                        ]),
                                      ]
                                    : (g.teamIds || []).filter(
                                        (id) =>
                                          !teamSelection.actionIds.includes(id),
                                      ),
                                }
                              : g,
                          ),
                        },
                        "Team links updated.",
                      ))
                    )
                      throw new Error("Could not save team links.");
                  },
                })), {
                  id: "move",
                  label: "Move selected teams",
                  description: "Move each selected team with its subteams. Direct members, learning-group links, and history stay attached; manager reporting access follows the new hierarchy.",
                  options: [{ id: "root", label: "Top level" }, ...teams.map((t) => ({ id: t.id, label: teamPath(t.id, teams) }))],
                  selectionMode: "single" as const,
                  review: (values: string[], ids: string[]) => {
                    try {
                      if (ids.some((id) => [...ancestorIds(id, teams)].some((ancestor) => ancestor !== id && ids.includes(ancestor))))
                        throw new Error("Select a parent or a subteam, not both.");
                      const destination = values[0] === "root" ? "" : values[0];
                      let working = data;
                      const impacts = ids.map((id) => {
                        const impact = teamMoveImpact(working, id, destination);
                        working = { ...working, teams: impact.next };
                        return impact;
                      });
                      return <ul className="text-copy">{impacts.map((impact) => <li key={impact.from}>{impact.from} → {impact.to} · {impact.branch.length} teams · {impact.people.length} people · {impact.managers.length} managers with reporting changes</li>)}</ul>;
                    } catch (error) { return <p role="alert">{(error as Error).message}</p>; }
                  },
                  apply: async (values: string[], ids: string[] = []) => {
                    if (ids.some((id) => [...ancestorIds(id, teams)].some((ancestor) => ancestor !== id && ids.includes(ancestor))))
                      throw new Error("Select a parent or a subteam, not both.");
                    const destination = values[0] === "root" ? "" : values[0];
                    let next = teams;
                    for (const id of ids) next = moveTeam(next, id, destination);
                    if (!(await commit({ ...data, teams: next }, "Team branches moved.")))
                      throw new Error("Could not save the team move.");
                  },
                }] as BulkCommand[]}
              />
            }
            selected={teamSelection.selected}
            onSelectionChange={teamSelection.setSelected}
            label="Teams"
            disabled={busy}
            onOpen={(id) => void openTeam(id)}
            items={[...teams].sort(byName).map((item) => ({
              id: item.id,
              parentId: item.parentId,
              label: item.name,
              description: `Manager: ${data.users.find((user) => user.id === item.managerId)?.name || "Unassigned"}`,
              meta: `${data.users.filter((user) => user.teamId === item.id).length} direct members · ${teams.filter((child) => child.parentId === item.id).length} subteams`,
            }))}
          />
        </>
      ) : (
        <>
          <ActionGroup>
            <Button
              variant="link"
              disabled={busy}
              onClick={() => void openTeam("")}
            >
              <ArrowLeft size={16} />
              Back to teams
            </Button>
            {team.parentId && (
              <Button
                variant="link"
                disabled={busy}
                onClick={() => void openTeam(team.parentId!)}
              >
                Parent: {teamName(team.parentId)}
              </Button>
            )}
          </ActionGroup>
          <SectionHeader
            title={<h2>{team.name}</h2>}
            description={`Manager: ${data.users.find((u) => u.id === team.managerId)?.name || "Unassigned"}`}
          >
            <ActionGroup>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void editTeam(team)}
              >
                Edit team details
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={busy}
                    aria-label="Team actions"
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => void startMove("out", team.id)}
                  >
                    Move team
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void deleteTeam(team)}>
                    Delete empty team
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </ActionGroup>
          </SectionHeader>
          <p className="text-copy text-muted-foreground">
            {direct.length} direct members · {descendantMembers.length} people
            in subteams · {children.length} immediate subteams
          </p>
          {notice && !editing && <Alert variant="destructive">{notice}</Alert>}
          {moving ? (
            <SettingsSection
              id="team-move"
              title={
                <h3>
                  {moving.snapshot
                    ? "Review team move"
                    : moving.mode === "into"
                      ? `Move an existing team into ${team.name}`
                      : `Move ${team.name}`}
                </h3>
              }
              guidance="Moving a team carries all its subteams. Direct memberships, branch managers, learning-group links and saved progress stay with their existing teams. Reporting access follows the new hierarchy."
              actions={
                <ActionGroup>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      if (await guard.current()) {
                        resetDraft();
                        destination.reveal();
                      }
                    }}
                  >
                    Cancel move
                  </Button>
                  {moving.snapshot ? (
                    <>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setMoving({ ...moving, snapshot: undefined });
                          setNotice("");
                        }}
                      >
                        Back to selection
                      </Button>
                      <Button
                        loading={busy}
                        disabled={!impact}
                        onClick={() => void applyMove()}
                      >
                        Move team
                      </Button>
                    </>
                  ) : (
                    <Button
                      disabled={!impact}
                      onClick={() => {
                        setMoving({
                          ...moving,
                          snapshot: JSON.stringify([data.teams, data.users]),
                        });
                        setNotice("");
                        destination.reveal();
                      }}
                    >
                      Review move
                    </Button>
                  )}
                </ActionGroup>
              }
            >
              {moving.snapshot && impact ? (
                <>
                  <dl className="grid gap-4 text-copy">
                    <div>
                      <dt className="font-semibold">Current location</dt>
                      <dd className="text-muted-foreground [overflow-wrap:anywhere]">
                        {impact.from}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">New location</dt>
                      <dd className="text-muted-foreground [overflow-wrap:anywhere]">
                        {impact.to}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    {impact.branch.length}{" "}
                    {impact.branch.length === 1 ? "team" : "teams"} and{" "}
                    {impact.people.length}{" "}
                    {impact.people.length === 1 ? "member" : "members"}{" "}
                    (including inactive accounts) move together.
                  </p>
                  <h4>Reporting access changes</h4>
                  {impact.managers.length ? (
                    <ul className="grid gap-3">
                      {impact.managers.map((change) => (
                        <li key={change.manager.id} className="text-copy">
                          <strong>{change.manager.name}</strong>
                          <span className="block text-muted-foreground">
                            {change.gained.length > 0 &&
                              `Gains ${change.gained.length} ${change.gained.length === 1 ? "team" : "teams"} / ${change.gainedPeople} active ${change.gainedPeople === 1 ? "person" : "people"}. `}
                            {change.lost.length > 0 &&
                              `Loses ${change.lost.length} ${change.lost.length === 1 ? "team" : "teams"} / ${change.lostPeople} active ${change.lostPeople === 1 ? "person" : "people"}.`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-copy text-muted-foreground">
                      No manager gains or loses reporting access.
                    </p>
                  )}
                  <p className="text-copy text-muted-foreground">
                    Counts account for overlapping management responsibilities.
                    Administrators retain organization-wide access.
                  </p>
                </>
              ) : (
                <SearchableSelectionList
                  label={
                    moving.mode === "into"
                      ? "Find a team to move here"
                      : "Choose a new parent"
                  }
                  selectionMode="single"
                  placeholder="Team name or hierarchy path"
                  emptyMessage="No eligible teams. Teams already here, this team and moves that create a cycle are excluded."
                  value={moving.choice == null ? [] : [moving.choice]}
                  onChange={(ids) =>
                    setMoving({
                      ...moving,
                      choice: ids[0] ?? null,
                      snapshot: undefined,
                    })
                  }
                  disabled={busy}
                  options={
                    moving.mode === "into"
                      ? [...teams]
                          .sort(byName)
                          .filter(
                            (item) =>
                              item.parentId !== team.id &&
                              canParent(item.id, team.id, teams),
                          )
                          .map((item) => ({
                            id: item.id,
                            label: item.name,
                            description: teamPath(item.id, teams),
                          }))
                      : [
                          ...(team.parentId
                            ? [
                                {
                                  id: "",
                                  label: "Top-level team",
                                  description:
                                    "Detach this branch from its current parent.",
                                },
                              ]
                            : []),
                          ...[...teams]
                            .sort(byName)
                            .filter(
                              (item) =>
                                item.id !== team.parentId &&
                                canParent(team.id, item.id, teams),
                            )
                            .map((item) => ({
                              id: item.id,
                              label: item.name,
                              description: teamPath(item.id, teams),
                            })),
                        ]
                  }
                />
              )}
              {moveError && <Alert variant="destructive">{moveError}</Alert>}
            </SettingsSection>
          ) : (
            <Tabs
              value={tab}
              onValueChange={async (value) => {
                if (!(await guard.current())) return;
                resetDraft();
                setTab(value);
                destination.reveal(false);
              }}
            >
              <TabsList aria-label="Team sections">
                <TabsTrigger value="members">Members</TabsTrigger>
                <TabsTrigger value="subteams">Subteams</TabsTrigger>
              </TabsList>
              <TabsContent value="members" className="grid gap-6">
                <SectionHeader
                  title={<h3 {...memberList.targetProps}>Team members</h3>}
                  description="Each person has one direct reporting team. Inactive accounts are labeled; pending accounts are managed in People."
                >
                  <BulkPicker
                    title="Add members"
                    description={`Add people to ${team.name}. People already in a different team move here. Manager reporting and team-linked assignments change; saved progress remains.`}
                    options={eligible.map((u) => ({
                      id: u.id,
                      label: u.name,
                      description: u.email + " · " + teamName(u.teamId),
                    }))}
                    actionLabel="Add members"
                    onApply={async (ids) => {
                      if (
                        !(await commit(
                          {
                            ...data,
                            users: data.users.map((u) =>
                              ids.includes(u.id)
                                ? { ...u, teamId: team.id }
                                : u,
                            ),
                          },
                          "Members added.",
                          true,
                        ))
                      )
                        throw new Error("Could not save members.");
                    }}
                    disabled={busy}
                  />
                </SectionHeader>
                <FilterBar search={
                  <FormField label="Find a member" visuallyHiddenLabel>
                    <Input
                      type="search"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Find a member by name or email"
                    />
                  </FormField>
                }>
                  <FormField label="Membership scope">
                    <SelectField
                      value={includeSubteams ? "all" : "direct"}
                      onValueChange={(value) => {
                        setIncludeSubteams(value === "all");
                        setPage(1);
                      }}
                    >
                      <option value="direct">Direct members</option>
                      <option value="all">Include subteams</option>
                    </SelectField>
                  </FormField>
                </FilterBar>
                <BulkActions
                  singleItemActions={false}
                  collectionSize={rosterSelection.collectionSize}
                  selected={rosterSelection.actionIds}
                  onSelectionChange={rosterSelection.setSelected}
                  noun="members"
                  commands={[
                    {
                      id: "remove",
                      label: "Remove from team",
                      description:
                        "Remove direct membership from this team. Reporting and team-linked assignments change; saved history remains.",
                      apply: async () => {
                        if (
                          !(await commit(
                            {
                              ...data,
                              users: data.users.map((u) =>
                                rosterSelection.actionIds.includes(u.id) &&
                                u.teamId === team.id
                                  ? { ...u, teamId: undefined }
                                  : u,
                              ),
                            },
                            "Members removed.",
                            true,
                          ))
                        )
                          throw new Error("Could not save members.");
                      },
                    },
                    {
                      id: "move",
                      label: "Move to team",
                      description:
                        "Move these direct members to one destination team. Manager reporting and team-linked assignments change; saved history remains.",
                      selectionMode: "single",
                      options: teams
                        .filter((t) => t.id !== team.id)
                        .map((t) => ({
                          id: t.id,
                          label: teamPath(t.id, teams),
                        })),
                      apply: async (ids) => {
                        if (
                          !(await commit(
                            {
                              ...data,
                              users: data.users.map((u) =>
                                rosterSelection.actionIds.includes(u.id) &&
                                u.teamId === team.id
                                  ? { ...u, teamId: ids[0] }
                                  : u,
                              ),
                            },
                            "Members moved.",
                            true,
                          ))
                        )
                          throw new Error("Could not save members.");
                      },
                    },
                  ]}
                />
                {members.length ? (
                  <TableContainer>
                    <DataTable layout="teamMembers" aria-label="Team members">
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <div className="flex items-center gap-3">
                              {rosterSelection.canSelect && (
                                <SelectRows
                                  label="Select this page of direct members"
                                  ids={members
                                    .slice(
                                      (currentPage - 1) * PAGE_SIZE,
                                      currentPage * PAGE_SIZE,
                                    )
                                    .filter((u) => u.teamId === team.id)
                                    .map((u) => u.id)}
                                  value={rosterSelection.selected}
                                  onChange={rosterSelection.setSelected}
                                />
                              )}
                              Person
                            </div>
                          </TableHead>
                          <TableHead>Direct team</TableHead>
                          <TableHead>
                            <span className="sr-only">Actions</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members
                          .slice(
                            (currentPage - 1) * PAGE_SIZE,
                            currentPage * PAGE_SIZE,
                          )
                          .map((u) => (
                            <TableRow key={u.id}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  {rosterSelection.canSelect && (
                                    <Checkbox
                                      aria-label={`Select ${u.name}`}
                                      disabled={u.teamId !== team.id}
                                      checked={rosterSelection.selected.includes(
                                        u.id,
                                      )}
                                      onCheckedChange={(v) =>
                                        rosterSelection.toggle(u.id, v === true)
                                      }
                                    />
                                  )}
                                  <strong>{u.name}</strong>
                                </div>
                                {u.teamId !== team.id && (
                                  <small>
                                    Inherited from a subteam; manage the direct
                                    team.
                                  </small>
                                )}
                                <small>{u.email}</small>
                                {!u.active && <Badge>Inactive</Badge>}
                              </TableCell>
                              <TableCell>{teamName(u.teamId)}</TableCell>
                              <TableCell>
                                {u.teamId === selected ? (
                                  <Button
                                    variant="link"
                                    disabled={busy}
                                    aria-label={`Remove ${u.name} from team`}
                                    onClick={() => void removeMember(u)}
                                  >
                                    Remove
                                  </Button>
                                ) : (
                                  <Button
                                    variant="link"
                                    disabled={busy}
                                    aria-label={`Manage ${u.name}'s team`}
                                    onClick={() => void openTeam(u.teamId!)}
                                  >
                                    Manage team
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </DataTable>
                  </TableContainer>
                ) : (
                  <EmptyState>
                    {query
                      ? "No members match your search."
                      : "No members in this view. Add existing people or include subteams."}
                  </EmptyState>
                )}
                {members.filter((u) => u.teamId === team.id).length >
                  PAGE_SIZE && (
                  <Button
                    type="button"
                    variant="link"
                    onClick={() =>
                      rosterSelection.setSelected(
                        members
                          .filter((u) => u.teamId === team.id)
                          .map((u) => u.id),
                      )
                    }
                  >
                    Select all matching direct members
                  </Button>
                )}
                <Pagination
                  label="Team members"
                  page={currentPage}
                  pageSize={PAGE_SIZE}
                  total={members.length}
                  onPageChange={(value) => {
                    setPage(value);
                    memberList.reveal();
                  }}
                  disabled={busy}
                />
              </TabsContent>
              <TabsContent value="subteams" className="grid gap-6">
                <SectionHeader
                  title={<h3>Subteams</h3>}
                  description="Open a subteam to manage its own members and children."
                >
                  <ActionGroup>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void startMove("into", team.id)}
                    >
                      Move existing team here
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void editTeam({
                          id: crypto.randomUUID(),
                          name: "",
                          parentId: team.id,
                        })
                      }
                    >
                      <Plus aria-hidden="true" />
                      Create subteam
                    </Button>
                  </ActionGroup>
                </SectionHeader>
                {teamTable(children)}
              </TabsContent>
            </Tabs>
          )}
        </>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) void closeEditor();
        }}
      >
        {editing && (
          <DialogContent
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              if (busy) e.preventDefault();
            }}
          >
            <DialogTitle>
              {teams.some((t) => t.id === editing.id)
                ? `Edit ${baseline.current?.name}`
                : "New team"}
            </DialogTitle>
            <DialogDescription>
              Edit the team name and manager. Use Move team to review changes to
              an existing team's reporting hierarchy.
            </DialogDescription>
            <form onSubmit={saveTeam} className="grid gap-4">
              {notice && <Alert variant="destructive">{notice}</Alert>}
              <FieldGroup disabled={busy}>
                <FormField label="Team name">
                  <Input
                    required
                    maxLength={80}
                    value={editing.name}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                  />
                </FormField>
                {!teams.some((item) => item.id === editing.id) && (
                  <FormField label="Parent team">
                    <SelectField
                      disabled={busy}
                      value={editing.parentId || ""}
                      onValueChange={(value) =>
                        setEditing({ ...editing, parentId: value || undefined })
                      }
                    >
                      <option value="">Top-level team</option>
                      {teams
                        .filter((t) => canParent(editing.id, t.id, teams))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {teamPath(t.id, teams)}
                          </option>
                        ))}
                    </SelectField>
                  </FormField>
                )}
                <FormField label="Manager">
                  <SelectField
                    disabled={busy}
                    aria-describedby="team-manager-guidance"
                    value={editing.managerId || ""}
                    onValueChange={(value) =>
                      setEditing({ ...editing, managerId: value || undefined })
                    }
                  >
                    <option value="">No manager</option>
                    {data.users
                      .filter(
                        (u) =>
                          u.active && ["manager", "admin"].includes(u.role),
                      )
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </SelectField>
                </FormField>
              </FieldGroup>
              <DialogFooter>
                <p
                  id="team-manager-guidance"
                  className="text-copy text-muted-foreground"
                >
                  Assigning a manager grants reporting access for this team and
                  its subteams.
                </p>
                <ActionGroup>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void closeEditor()}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" loading={busy}>
                    Save team
                  </Button>
                </ActionGroup>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}
