"use client";

import { BulkPicker } from "./patterns/bulk-selection";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
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
  const [moveMembers, setMoveMembers] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState("");
  const [tab, setTab] = useState("members");
  const [query, setQuery] = useState("");
  const [includeSubteams, setIncludeSubteams] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Team | null>(null);
  const baseline = useRef<Team | null>(null);
  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
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
  const addPanel = useRevealTarget<HTMLElement>();
  const team = teams.find((t) => t.id === selected);
  const dirty =
    !!chosen.length ||
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
    setAdding(false);
    setChosen([]);
    setReviewing(false);
    setReviewPage(1);
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
  async function commit(next: Workspace, message: string) {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setNotice("");
    try {
      await onChange(next);
      notify(message);
      return true;
    } catch (error) {
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
  async function addMembers() {
    if (!team || saving.current || !chosen.length) return;
    if (
      chosen.some(
        (id) =>
          !data.users.some(
            (u) => u.id === id && u.active && u.teamId !== team.id,
          ),
      )
    ) {
      setNotice(
        "The available people changed. Go back and review your selections.",
      );
      return;
    }
    if (
      await commit(
        {
          ...data,
          users: data.users.map((u) =>
            chosen.includes(u.id) ? { ...u, teamId: team.id } : u,
          ),
        },
        "Team members updated.",
      )
    ) {
      resetDraft();
      setPage(1);
      setQuery("");
      setIncludeSubteams(false);
      memberList.reveal();
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
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(members.length / PAGE_SIZE)),
  );
  const eligible = data.users
    .filter((u) => u.active && u.teamId !== selected)
    .sort(byName);
  const chosenUsers = data.users
    .filter((u) => chosen.includes(u.id))
    .sort(byName);
  const currentReviewPage = Math.min(
    reviewPage,
    Math.max(1, Math.ceil(chosenUsers.length / PAGE_SIZE)),
  );
  const teamName = (id?: string) =>
    teams.find((t) => t.id === id)?.name || "No team";

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
          >
            <Button
              onClick={() =>
                void editTeam({ id: crypto.randomUUID(), name: "" })
              }
            >
              Add team
            </Button>
          </SectionHeader>
          <HierarchyList
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
                  <Button
                    disabled={busy || adding}
                    onClick={() => {
                      setAdding(true);
                      setNotice("");
                      addPanel.reveal();
                    }}
                  >
                    Add members
                  </Button>
                </SectionHeader>
                {adding && (
                  <SettingsSection
                    {...addPanel.targetProps}
                    id="team-add-members"
                    title={
                      <h3>
                        {reviewing
                          ? "Review member changes"
                          : `Add members to ${team.name}`}
                      </h3>
                    }
                    guidance="Adding someone from another team moves their direct membership. Team-linked learning assignments may change; saved course progress is retained."
                    actions={
                      <ActionGroup>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={async () => {
                            if (await guard.current()) {
                              resetDraft();
                              memberList.reveal();
                            }
                          }}
                        >
                          Cancel
                        </Button>
                        {reviewing ? (
                          <>
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setChosen((ids) =>
                                  ids.filter((id) =>
                                    eligible.some((u) => u.id === id),
                                  ),
                                );
                                setReviewing(false);
                                setNotice("");
                                addPanel.reveal();
                              }}
                            >
                              Back to selection
                            </Button>
                            <Button
                              loading={busy}
                              onClick={() => void addMembers()}
                            >
                              Apply changes
                            </Button>
                          </>
                        ) : (
                          <Button
                            disabled={!chosen.length}
                            onClick={() => {
                              setReviewing(true);
                              setReviewPage(1);
                              addPanel.reveal();
                            }}
                          >
                            Review {chosen.length} selected
                          </Button>
                        )}
                      </ActionGroup>
                    }
                  >
                    {notice && <Alert variant="destructive">{notice}</Alert>}
                    {reviewing ? (
                      <>
                        <p>
                          {chosenUsers.length} people will join {team.name}.
                        </p>
                        <ul className="grid gap-3">
                          {chosenUsers
                            .slice(
                              (currentReviewPage - 1) * PAGE_SIZE,
                              currentReviewPage * PAGE_SIZE,
                            )
                            .map((u) => (
                              <li
                                key={u.id}
                                className="text-copy [overflow-wrap:anywhere]"
                              >
                                <strong>{u.name}</strong> · {u.email}
                                <span className="block text-muted-foreground">
                                  {u.teamId
                                    ? `Move from ${teamName(u.teamId)} to ${team.name}`
                                    : `Add to ${team.name}`}
                                </span>
                              </li>
                            ))}
                        </ul>
                        <Pagination
                          label="Selected members"
                          page={currentReviewPage}
                          total={chosenUsers.length}
                          pageSize={PAGE_SIZE}
                          onPageChange={setReviewPage}
                          disabled={busy}
                        />
                      </>
                    ) : (
                      <SearchableSelectionList
                        label="Find people to add"
                        options={eligible.map((u) => ({
                          id: u.id,
                          label: u.name,
                          description: `${u.email} · ${teamName(u.teamId)}`,
                        }))}
                        value={chosen}
                        onChange={setChosen}
                        disabled={busy}
                      />
                    )}
                  </SettingsSection>
                )}
                <FilterBar>
                  <FormField label="Find a member">
                    <Input
                      type="search"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Name or email"
                    />
                  </FormField>
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
                <ActionGroup>
                  <BulkPicker
                    title="Remove members"
                    description="Remove direct membership from this team. Team-linked learning assignments and manager reporting change; saved progress is preserved."
                    options={direct.map((u) => ({
                      id: u.id,
                      label: u.name,
                      description: u.email,
                    }))}
                    onApply={async (ids) => {
                      await onChange({
                        ...data,
                        users: data.users.map((u) =>
                          ids.includes(u.id) ? { ...u, teamId: undefined } : u,
                        ),
                      });
                    }}
                    actionLabel="Remove members"
                    disabled={busy}
                  />
                  <BulkPicker
                    title="Move members to another team"
                    description="Choose direct members to move. The next step lets you choose their destination team."
                    options={direct.map((u) => ({
                      id: u.id,
                      label: u.name,
                      description: u.email,
                    }))}
                    onApply={async (ids) => {
                      setMoveMembers(ids);
                    }}
                    actionLabel="Choose destination"
                    disabled={busy}
                  />
                </ActionGroup>
                {moveMembers.length > 0 && (
                  <div className="grid gap-3">
                    <FormField
                      label={`Destination for ${moveMembers.length} selected members`}
                      description="Manager visibility and team-linked assignments will change. Saved course progress is preserved."
                    >
                      <SelectField
                        value={moveTarget}
                        onValueChange={setMoveTarget}
                      >
                        <option value="">Choose a team</option>
                        {teams
                          .filter((t) => t.id !== team.id)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </SelectField>
                    </FormField>
                    <ActionGroup>
                      <Button
                        variant="outline"
                        onClick={() => setMoveMembers([])}
                      >
                        Cancel move
                      </Button>
                      <Button
                        disabled={!moveTarget || busy}
                        onClick={async () => {
                          if (
                            await commit(
                              {
                                ...data,
                                users: data.users.map((u) =>
                                  moveMembers.includes(u.id) &&
                                  u.teamId === team.id
                                    ? { ...u, teamId: moveTarget }
                                    : u,
                                ),
                              },
                              "Members moved.",
                            )
                          )
                            setMoveMembers([]);
                        }}
                      >
                        Move {moveMembers.length} members
                      </Button>
                    </ActionGroup>
                  </div>
                )}
                {members.length ? (
                  <TableContainer>
                    <DataTable layout="teamMembers" aria-label="Team members">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Person</TableHead>
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
                                <strong>{u.name}</strong>
                                <small>{u.email}</small>
                                {!u.active && <Badge>Inactive</Badge>}
                              </TableCell>
                              <TableCell>{teamName(u.teamId)}</TableCell>
                              <TableCell>
                                {u.teamId === selected ? (
                                  <Button
                                    variant="link"
                                    disabled={busy || adding}
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
                            {t.name}
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
