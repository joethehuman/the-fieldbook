"use client";
import { DetailNavigation } from "./patterns/detail-navigation";

import { BulkActions, type BulkCommand } from "./patterns/bulk-actions";
import { Checkbox } from "./ui/choice";
import { SelectRows, useBulkSelection } from "./patterns/bulk-selection";
import { BulkPicker } from "./patterns/bulk-selection";
import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import type { Workspace } from "@/lib/store";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import {
  ancestorIds,
  reportingTeamId,
  canParent,
  groupTeamLinks,
  type Team,
  type User,
} from "@/lib/types";
import {
  isOrganizationChangeCanceled,
  organizationChangeSummary,
  type OrganizationChangeOptions,
} from "@/lib/organization-change";
import {
  moveTeam,
  teamMoveImpact,
  teamPath,
  teamDeletionBlockers,
} from "@/lib/team-hierarchy";
import {
  HierarchyBrowser,
  hierarchyBrowserMatches,
} from "./patterns/hierarchy-browser";
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
  DialogBody,
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
import {
  CollectionControls,
  CollectionEmpty,
} from "./patterns/collection-controls";
import { SectionHeader, EmptyState } from "./patterns/layout";
import { Pagination } from "./patterns/pagination";
import { SearchableSelectionList } from "./patterns/searchable-selection-list";
import { useRevealTarget } from "./patterns/use-reveal-target";
import { groupPath } from "@/lib/group-hierarchy";
import { organizationTeam } from "@/lib/organization-team";
import { HierarchyPicker } from "./patterns/hierarchy-picker";

const PAGE_SIZE = 25;
const byName = (
  a: { name: string; id: string },
  b: { name: string; id: string },
) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
const teamMutationSnapshot = (data: Workspace) =>
  JSON.stringify([
    data.governanceRevision,
    data.teams,
    data.groups,
    data.curricula,
    data.users,
  ]);

export function TeamsAdmin({
  data,
  onChange,
  registerNavigationGuard,
}: {
  data: Workspace;
  onChange: (
    data: Workspace,
    options?: OrganizationChangeOptions,
  ) => void | Promise<void>;
  registerNavigationGuard?: RegisterNavigationGuard;
}) {
  const teams = data.teams || [];
  const organization = organizationTeam(
    teams,
    data.settings?.organizationTeamId,
  );
  const [hierarchyQuery, setHierarchyQuery] = useState("");
  const [browseId, setBrowseId] = useState("");
  const [browserReveal, setBrowserReveal] = useState<{
    id: string;
    token: number;
  }>();
  const browserRevealCount = useRef(0);
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState("members");
  const [query, setQuery] = useState("");
  const [selectTeams, setSelectTeams] = useState(false);
  const [memberSort, setMemberSort] = useState("name");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Team | null>(null);
  const editorCloseFocus = useRef<(() => void) | null>(null);
  const baseline = useRef<Team | null>(null);
  const editSnapshot = useRef("");
  const [moving, setMoving] = useState<{
    mode: "into" | "out";
    id: string;
    choice: string | null;
    snapshot?: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const latestData = useRef(data);
  latestData.current = data;
  const notify = useToast();
  const { confirm } = useInteractionDialog();
  const destination = useRevealTarget<HTMLHeadingElement>({ context: true });
  const browserTarget = useRevealTarget<HTMLHeadingElement>({ context: true });
  const memberList = useRevealTarget<HTMLHeadingElement>();
  const team = teams.find((t) => t.id === selected);
  const managingOrganization = !!team && team.id === organization?.id;
  const dirty =
    moving?.choice != null ||
    (!!editing && JSON.stringify(editing) !== JSON.stringify(baseline.current));
  const editId = editing?.id;
  const editParentId = editing?.parentId;
  const editManagerId = editing?.managerId;
  const originalParentId = baseline.current?.parentId;
  const originalManagerId = baseline.current?.managerId;
  const editingNeedsReview = useMemo(() => {
    if (
      !editId ||
      (editParentId === originalParentId && editManagerId === originalManagerId)
    )
      return false;
    return organizationChangeSummary(data, {
      ...data,
      teams: [
        ...(data.teams || []).filter((value) => value.id !== editId),
        {
          ...teams.find((value) => value.id === editId),
          id: editId,
          name: "",
          parentId: editParentId,
          managerId: editManagerId,
          system: teams.find((value) => value.id === editId)?.system,
        },
      ],
    }).changed;
  }, [
    data,
    editId,
    editParentId,
    editManagerId,
    originalParentId,
    originalManagerId,
  ]);
  const guard = useRef(async () => true);
  guard.current = async () =>
    !saving.current &&
    (!dirty || (await confirm("Discard unsaved team changes?")));
  useEffect(() => {
    registerNavigationGuard?.(() => guard.current(), {
      protected: dirty || busy,
    });
    return () => registerNavigationGuard?.(null);
  }, [registerNavigationGuard, dirty, busy]);
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
    if (id) destination.reveal();
    else browserTarget.reveal();
  }
  async function browseTeam(id: string) {
    if (!(await guard.current())) return;
    resetDraft();
    setBrowseId(id);
    setHierarchyQuery("");
    setSelectTeams(false);
    teamSelection.setSelected([]);
    setBrowserReveal(undefined);
  }
  function revealTeamLocation(value: Team, created = false, focus = true) {
    setBrowseId(
      value.parentId === organization?.id ? "" : value.parentId || "",
    );
    setHierarchyQuery("");
    setSelectTeams(false);
    teamSelection.setSelected([]);
    setBrowserReveal(
      !focus || value.id === organization?.id
        ? undefined
        : { id: value.id, token: ++browserRevealCount.current },
    );
    if (created) {
      setSelected("");
      setQuery("");
      setPage(1);
    }
  }
  async function editTeam(value: Team) {
    if (!(await guard.current())) return;
    resetDraft();
    baseline.current = { ...value };
    editSnapshot.current = teamMutationSnapshot(data);
    setEditing({ ...value });
  }
  async function closeEditor(discard = false) {
    if (!saving.current && (discard || (await guard.current()))) {
      setEditing(null);
      setNotice("");
    }
  }
  async function commit(
    next: Workspace,
    message: string,
    propagate = false,
    options?: OrganizationChangeOptions,
  ) {
    if (saving.current) return false;
    if (data !== latestData.current) {
      const error = new Error(
        "The organization changed while this action was open. Close it and reopen the action before saving.",
      );
      if (propagate) throw error;
      setNotice(error.message);
      return false;
    }
    saving.current = true;
    setBusy(true);
    setNotice("");
    try {
      await onChange(next, options);
      notify(message);
      return true;
    } catch (error) {
      if (propagate) throw error;
      if (isOrganizationChangeCanceled(error)) return false;
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
    if (editSnapshot.current !== teamMutationSnapshot(data)) {
      setNotice(
        "Organization data changed while this editor was open. Close it and reopen the team before saving.",
      );
      return;
    }
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
              parentId: editing.parentId,
            },
          ],
        },
        "Team saved.",
        false,
        { review: { title: "Review team changes", confirmLabel: "Save team" } },
      )
    ) {
      const savedTeam = { ...editing, name };
      // A successful save has a new destination. Wait for the editor's close
      // auto-focus event rather than racing its delayed trigger restoration.
      editorCloseFocus.current = () => {
        if (!created && selected) destination.reveal();
        else if (savedTeam.id === organization?.id) browserTarget.reveal();
        else
          setBrowserReveal({
            id: savedTeam.id,
            token: ++browserRevealCount.current,
          });
      };
      setEditing(null);
      revealTeamLocation(savedTeam, created, false);
    }
  }
  async function startMove(mode: "into" | "out", id: string) {
    if (!(await guard.current())) return;
    resetDraft();
    setMoving({
      mode,
      id,
      choice: null,
      snapshot: teamMutationSnapshot(data),
    });
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
    if (moving.snapshot !== teamMutationSnapshot(data)) {
      setMoving({ ...moving, snapshot: undefined });
      setNotice(
        "Organization data changed. Close this move and reopen it to choose from the current hierarchy.",
      );
      return;
    }
    try {
      const next = moveTeam(teams, moveSource, moveParent);
      if (
        await commit(
          { ...data, teams: next },
          "Team moved. Reporting hierarchy updated.",
          false,
          {
            review: {
              title: "Review team move",
              description: `${impact?.from} → ${impact?.to}. The whole branch moves together.`,
              confirmLabel: "Move team",
            },
          },
        )
      ) {
        resetDraft();
        revealTeamLocation(next.find((value) => value.id === moveSource)!);
        if (moving.mode === "into") setTab("subteams");
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
      blockers.learning.length &&
        `${blockers.learning.length} assigned courses or curricula`,
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
        `Cannot delete ${value.name}: it still has ${reasons.join("; ")}. Move or remove these links first. To keep the team but detach it, use Move team → Organization.`,
      );
      destination.reveal();
      return;
    }
    if (
      await commit(
        { ...data, teams: teams.filter((item) => item.id !== value.id) },
        "Empty team deleted.",
        false,
        {
          review: {
            title: `Delete ${value.name}?`,
            description: "This permanently removes the empty team.",
            confirmLabel: "Delete team",
            always: true,
          },
        },
      )
    ) {
      setSelected("");
      setBrowseId(
        value.parentId === organization?.id ? "" : value.parentId || "",
      );
      setHierarchyQuery("");
      setBrowserReveal(undefined);
      browserTarget.reveal();
    }
  }
  async function removeMember(user: User) {
    if (!team || user.teamId !== team.id || saving.current) return;
    if (
      await commit(
        {
          ...data,
          users: data.users.map((u) =>
            u.id === user.id ? { ...u, teamId: undefined } : u,
          ),
        },
        "Member returned to Organization.",
        false,
        {
          review: {
            title: "Review membership changes",
            description: `Remove ${user.name} from ${team.name}. They return to Organization. Their account and saved progress are kept.`,
            confirmLabel: "Remove member",
          },
        },
      )
    )
      memberList.reveal();
  }
  const memberTeam = (user: User) => reportingTeamId(user.teamId, teams);
  const direct = data.users.filter((u) => memberTeam(u) === selected);
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
  const roster = managingOrganization
    ? direct
    : [...direct, ...descendantMembers];
  const members = roster
    .filter((u) =>
      `${u.name} ${u.email}`.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => (memberSort === "reverse" ? byName(b, a) : byName(a, b)));
  const children = teams.filter((t) => t.parentId === selected).sort(byName);
  const rosterSelection = useBulkSelection(
    selected + tab + query,
    members.map((u) => u.id),
    members.filter((u) => memberTeam(u) === team?.id).map((u) => u.id),
  );
  const hierarchyItems = [...teams]
    .filter((value) => value.id !== organization?.id)
    .sort(byName)
    .map((item) => ({
      id: item.id,
      parentId: item.parentId === organization?.id ? undefined : item.parentId,
      label: item.name,
      description: `Manager: ${data.users.find((user) => user.id === item.managerId)?.name || "Unassigned"}`,
      directMemberCount: data.users.filter((user) => user.teamId === item.id)
        .length,
    }));
  const teamSelection = useBulkSelection(
    "teams" + hierarchyQuery,
    hierarchyBrowserMatches(hierarchyItems, hierarchyQuery).map(
      (item) => item.id,
    ),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(members.length / PAGE_SIZE)),
  );
  const eligible = data.users
    .filter((u) => u.active && memberTeam(u) !== selected)
    .sort(byName);
  const teamName = (id?: string) =>
    teams.find((team) => team.id === reportingTeamId(id, teams))?.name ||
    "No team";

  function teamTable(rows: Team[]) {
    return rows.length ? (
      <TableContainer>
        <DataTable layout="teamBranches" aria-label="Subteams">
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
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
      aria-label={team ? `${team.name} management` : "Teams"}
      className="grid min-w-0 gap-6"
    >
      <div
        hidden={!!team}
        data-reveal-context
        className={team ? "hidden" : "grid min-w-0 gap-4"}
      >
        <SectionHeader
          variant="page"
          title={<h2 {...browserTarget.targetProps}>Teams</h2>}
        >
          {organization && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void openTeam(organization.id)}
            >
              Organization
            </Button>
          )}
        </SectionHeader>
        <HierarchyBrowser
          branchId={browseId}
          onBrowse={browseTeam}
          query={hierarchyQuery}
          onQueryChange={(value) => {
            setHierarchyQuery(value);
            teamSelection.setSelected([]);
          }}
          reveal={browserReveal}
          primaryAction={
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void editTeam({
                  id: crypto.randomUUID(),
                  name: "",
                  parentId: browseId || organization?.id || undefined,
                })
              }
            >
              <Plus aria-hidden="true" />
              Add team
            </Button>
          }
          secondaryActions={
            (hierarchyItems.length > 1 || selectTeams) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-pressed={selectTeams}
                onClick={() => {
                  setSelectTeams(!selectTeams);
                  teamSelection.setSelected([]);
                }}
              >
                {selectTeams ? "Done selecting" : "Select teams"}
              </Button>
            )
          }
          selectionActions={
            selectTeams ? (
              <BulkActions
                singleItemActions={false}
                collectionSize={teamSelection.collectionSize}
                selected={teamSelection.actionIds}
                onSelectionChange={teamSelection.setSelected}
                noun="teams"
                commands={
                  [
                    ...([true, false] as const).map((add) => ({
                      id: add ? "add-groups" : "remove-groups",
                      label: add
                        ? "Add to learning groups"
                        : "Remove from learning groups",
                      description:
                        "Linked teams include all subteams. Review assignment changes before saving; accounts and saved progress are preserved.",
                      options: data.groups.map((g) => ({
                        id: g.id,
                        label: groupPath(g.id, data.groups),
                      })),
                      apply: async (ids: string[]) => {
                        if (
                          !(await commit(
                            {
                              ...data,
                              groups: data.groups.map((g) => {
                                if (!ids.includes(g.id)) return g;
                                const links = groupTeamLinks(g);
                                const subtree = links
                                  .filter((link) => link.scope === "subtree")
                                  .map((link) => link.teamId);
                                const directOnly = links
                                  .filter((link) => link.scope === "direct")
                                  .map((link) => link.teamId);
                                return {
                                  ...g,
                                  teamLinkScope: "subtree" as const,
                                  teamIds: add
                                    ? [
                                        ...new Set([
                                          ...subtree,
                                          ...teamSelection.actionIds,
                                        ]),
                                      ]
                                    : subtree.filter(
                                        (id) =>
                                          !teamSelection.actionIds.includes(id),
                                      ),
                                  legacyDirectTeamIds: directOnly.filter(
                                    (id) =>
                                      !teamSelection.actionIds.includes(id),
                                  ),
                                };
                              }),
                            },
                            "Team links updated.",
                            true,
                          ))
                        )
                          throw new Error("Could not save team links.");
                      },
                    })),
                    {
                      id: "move",
                      label: "Move selected teams",
                      description:
                        "Move each selected team with its subteams. Direct members, learning-group links, and history stay attached; manager reporting access follows the new hierarchy.",
                      options: [
                        {
                          id: "root",
                          label: organization?.name || "Top level",
                        },
                        ...teams
                          .filter((t) => t.id !== organization?.id)
                          .map((t) => ({
                            id: t.id,
                            label: teamPath(t.id, teams),
                          })),
                      ],
                      selectionMode: "single" as const,
                      review: (values: string[], ids: string[]) => {
                        try {
                          if (
                            ids.some((id) =>
                              [...ancestorIds(id, teams)].some(
                                (ancestor) =>
                                  ancestor !== id && ids.includes(ancestor),
                              ),
                            )
                          )
                            throw new Error(
                              "Select a parent or a subteam, not both.",
                            );
                          const destination =
                            values[0] === "root" ? "" : values[0];
                          let working = data;
                          const impacts = ids.map((id) => {
                            const impact = teamMoveImpact(
                              working,
                              id,
                              destination,
                            );
                            working = { ...working, teams: impact.next };
                            return impact;
                          });
                          return (
                            <ul className="text-copy">
                              {impacts.map((impact) => (
                                <li key={impact.from}>
                                  {impact.from} → {impact.to}
                                </li>
                              ))}
                            </ul>
                          );
                        } catch (error) {
                          return <p role="alert">{(error as Error).message}</p>;
                        }
                      },
                      apply: async (values: string[], ids: string[] = []) => {
                        if (
                          ids.some((id) =>
                            [...ancestorIds(id, teams)].some(
                              (ancestor) =>
                                ancestor !== id && ids.includes(ancestor),
                            ),
                          )
                        )
                          throw new Error(
                            "Select a parent or a subteam, not both.",
                          );
                        const destination =
                          values[0] === "root" ? "" : values[0];
                        let next = teams;
                        for (const id of ids)
                          next = moveTeam(next, id, destination);
                        if (
                          !(await commit(
                            { ...data, teams: next },
                            "Team branches moved.",
                            true,
                          ))
                        )
                          throw new Error("Could not save the team move.");
                      },
                    },
                  ] as BulkCommand[]
                }
              />
            ) : undefined
          }
          selected={selectTeams ? teamSelection.selected : undefined}
          onSelectionChange={
            selectTeams ? teamSelection.setSelected : undefined
          }
          label="Teams"
          disabled={busy}
          onOpen={(id) => void openTeam(id)}
          onEdit={(id) =>
            void editTeam(teams.find((value) => value.id === id)!)
          }
          items={hierarchyItems}
        />
      </div>
      {team && (
        <div className="grid min-w-0 gap-6">
          <div data-reveal-context className="grid min-w-0 gap-4">
            <DetailNavigation
              disabled={busy}
              items={[
                { label: "Back to teams", onSelect: () => openTeam("") },
                ...(team.parentId
                  ? [
                      {
                        label: `Parent: ${teamName(team.parentId)}`,
                        onSelect: () => openTeam(team.parentId!),
                      },
                    ]
                  : []),
              ]}
              current={managingOrganization ? "Organization" : team.name}
            />
            <SectionHeader
              variant="page"
              title={
                <h2 {...destination.targetProps}>
                  {managingOrganization ? "Organization" : team.name}
                </h2>
              }
              description={`Manager: ${data.users.find((u) => u.id === team.managerId)?.name || "Unassigned"}`}
            >
              <ActionGroup>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void editTeam(team)}
                >
                  {managingOrganization ? "Edit manager" : "Edit team details"}
                </Button>
                {!managingOrganization && (
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
                      <DropdownMenuItem
                        onSelect={() =>
                          void editTeam({
                            id: crypto.randomUUID(),
                            name: "",
                            parentId: team.id,
                          })
                        }
                      >
                        Create subteam
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => void startMove("into", team.id)}
                      >
                        Move existing team here
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => void deleteTeam(team)}>
                        Delete empty team
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </ActionGroup>
            </SectionHeader>
            <p className="text-copy text-muted-foreground">
              {direct.length + descendantMembers.length} people{" "}
              {managingOrganization ? "across Organization" : "in this branch"}{" "}
              · {direct.length}{" "}
              {managingOrganization ? "at Organization" : "direct members"}
              {children.length > 0 &&
                ` · ${children.length} ${managingOrganization ? (children.length === 1 ? "top-level team" : "top-level teams") : children.length === 1 ? "subteam" : "subteams"}`}
            </p>
          </div>
          {notice && !editing && !moving && (
            <Alert variant="destructive">{notice}</Alert>
          )}
          <Tabs
            value={
              tab === "subteams" && (!children.length || managingOrganization)
                ? "members"
                : tab
            }
            onValueChange={async (value) => {
              if (!(await guard.current())) return;
              resetDraft();
              setTab(value);
              destination.reveal(false);
            }}
          >
            {!managingOrganization && children.length > 0 && (
              <TabsList aria-label="Team sections">
                <TabsTrigger value="members">Members</TabsTrigger>
                {children.length > 0 && (
                  <TabsTrigger value="subteams">Subteams</TabsTrigger>
                )}
              </TabsList>
            )}
            <TabsContent value="members" className="grid gap-6">
              <SectionHeader
                title={
                  <h3 {...memberList.targetProps}>
                    {managingOrganization ? "People at Organization" : "People"}
                  </h3>
                }
                description={
                  managingOrganization
                    ? "People without a named team appear here automatically. The organization manager can report on everyone across all teams."
                    : "People belong to one team. Subteam members appear here for reporting."
                }
              />
              <CollectionControls
                primaryAction={
                  <BulkPicker
                    title="Add members"
                    description={`Add people to ${team.name}. People in another team move here. Their accounts and saved progress are kept.`}
                    options={eligible.map((u) => ({
                      id: u.id,
                      label: u.name,
                      description: u.email + " · " + teamName(u.teamId),
                    }))}
                    actionLabel="Review changes"
                    onApply={async (ids) => {
                      if (
                        !(await commit(
                          {
                            ...data,
                            users: data.users.map((u) =>
                              ids.includes(u.id)
                                ? {
                                    ...u,
                                    teamId: managingOrganization
                                      ? undefined
                                      : team.id,
                                  }
                                : u,
                            ),
                          },
                          "Members added.",
                          true,
                          {
                            review: {
                              title: "Review membership changes",
                              confirmLabel: "Add members",
                            },
                          },
                        ))
                      )
                        throw new Error("Could not save members.");
                    }}
                    disabled={busy}
                  />
                }
                sortLabel={memberSort === "name" ? "Name A–Z" : "Name Z–A"}
                sort={
                  <FormField label="Sort team members">
                    <SelectField
                      value={memberSort}
                      onValueChange={(value) => {
                        setMemberSort(value);
                        setPage(1);
                      }}
                    >
                      <option value="name">Name A–Z</option>
                      <option value="reverse">Name Z–A</option>
                    </SelectField>
                  </FormField>
                }
                onClear={() => {
                  setQuery("");
                  setPage(1);
                }}
                filters={
                  query
                    ? [
                        {
                          id: "query",
                          label: `Search: ${query}`,
                          onRemove: () => {
                            setQuery("");
                            setPage(1);
                          },
                        },
                      ]
                    : []
                }
                search={
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
                }
              />
              <BulkActions
                singleItemActions={managingOrganization}
                collectionSize={rosterSelection.collectionSize}
                selected={rosterSelection.actionIds}
                onSelectionChange={rosterSelection.setSelected}
                noun="people"
                range={
                  members.length
                    ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, members.length)} of ${members.length} people`
                    : "0 people"
                }
                commands={[
                  {
                    id: "remove",
                    label: "Remove from team",
                    description:
                      "Return direct members to Organization. Reporting and team-linked assignments change; saved history remains.",
                    disabledReason: managingOrganization
                      ? "People without a named team always belong to Organization. Move them to a team instead."
                      : undefined,
                    apply: async () => {
                      if (
                        !(await commit(
                          {
                            ...data,
                            users: data.users.map((u) =>
                              rosterSelection.actionIds.includes(u.id) &&
                              memberTeam(u) === team.id
                                ? { ...u, teamId: undefined }
                                : u,
                            ),
                          },
                          "Members returned to Organization.",
                          true,
                          {
                            review: {
                              title: "Review membership changes",
                              confirmLabel: "Remove members",
                            },
                          },
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
                              memberTeam(u) === team.id
                                ? {
                                    ...u,
                                    teamId:
                                      ids[0] === organization?.id
                                        ? undefined
                                        : ids[0],
                                  }
                                : u,
                            ),
                          },
                          "Members moved.",
                          true,
                          {
                            review: {
                              title: "Review membership changes",
                              confirmLabel: "Move members",
                            },
                          },
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
                                  .filter((u) => memberTeam(u) === team.id)
                                  .map((u) => u.id)}
                                value={rosterSelection.selected}
                                onChange={rosterSelection.setSelected}
                              />
                            )}
                            Person
                          </div>
                        </TableHead>
                        <TableHead>Included through</TableHead>
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
                                    disabled={memberTeam(u) !== team.id}
                                    aria-describedby={
                                      memberTeam(u) !== team.id
                                        ? `team-membership-${u.id}`
                                        : undefined
                                    }
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
                              {memberTeam(u) !== team.id && (
                                <span
                                  id={`team-membership-${u.id}`}
                                  className="sr-only"
                                >
                                  Manage membership in {teamName(u.teamId)}.
                                </span>
                              )}
                              <small>{u.email}</small>
                              {!u.active && <Badge>Inactive</Badge>}
                              {u.active && u.registered === false && (
                                <Badge>Not signed in</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {managingOrganization && !u.teamId
                                ? "No direct team"
                                : memberTeam(u) === team.id
                                  ? "Direct member"
                                  : teamName(u.teamId)}
                            </TableCell>
                            <TableCell>
                              {managingOrganization ? null : memberTeam(u) ===
                                selected ? (
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
                                  onClick={() => void openTeam(memberTeam(u)!)}
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
                <CollectionEmpty
                  count={0}
                  total={roster.length}
                  noun="members"
                  onClear={() => {
                    setQuery("");
                    setPage(1);
                  }}
                />
              )}
              {members.filter((u) => memberTeam(u) === team.id).length >
                PAGE_SIZE && (
                <Button
                  type="button"
                  variant="link"
                  onClick={() =>
                    rosterSelection.setSelected(
                      members
                        .filter((u) => memberTeam(u) === team.id)
                        .map((u) => u.id),
                    )
                  }
                >
                  Select all matching direct members
                </Button>
              )}
              <Pagination
                label="Team members"
                showCount={false}
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
            {!managingOrganization && children.length > 0 && (
              <TabsContent value="subteams" className="grid gap-6">
                <SectionHeader title={<h3>Subteams</h3>}>
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
            )}
          </Tabs>
        </div>
      )}
      <Dialog
        open={!!moving}
        onOpenChange={async (open) => {
          if (!open && (await guard.current())) resetDraft();
        }}
      >
        {moving && team && (
          <DialogContent
            size="picker"
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <DialogTitle>
              {moving.mode === "into"
                ? `Move a team into ${team.name}`
                : `Move ${team.name}`}
            </DialogTitle>
            <DialogDescription>
              Choose a new place for the whole branch. You’ll review any
              reporting or learning changes before saving.
            </DialogDescription>
            {notice && <Alert variant="destructive">{notice}</Alert>}
            <DialogBody className="flex flex-col overflow-y-auto">
              <SearchableSelectionList
                bounded="compact"
                label={
                  moving.mode === "into"
                    ? "Find a team to move here"
                    : "Choose a new parent"
                }
                selectionMode="single"
                placeholder="Team name or hierarchy path"
                emptyMessage="No eligible teams. Moves that create a cycle are excluded."
                value={moving.choice == null ? [] : [moving.choice]}
                onChange={(ids) =>
                  setMoving({ ...moving, choice: ids[0] ?? null })
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
                        ...(team.parentId && !organization
                          ? [
                              {
                                id: "",
                                label: "Top-level team",
                                description:
                                  "Keep this branch; remove its parent.",
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
            </DialogBody>
            {impact && (
              <p className="text-copy text-muted-foreground [overflow-wrap:anywhere]">
                {impact.from} → {impact.to}
              </p>
            )}
            {moveError && <Alert variant="destructive">{moveError}</Alert>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={resetDraft}
              >
                Cancel
              </Button>
              <Button
                type="button"
                loading={busy}
                disabled={!impact || !moving.snapshot}
                onClick={() => void applyMove()}
              >
                Review move
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) void closeEditor();
        }}
      >
        {editing && (
          <DialogContent
            onCloseAutoFocus={(event) => {
              const focus = editorCloseFocus.current;
              if (!focus) return;
              event.preventDefault();
              editorCloseFocus.current = null;
              focus();
            }}
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              if (busy) e.preventDefault();
            }}
          >
            <DialogTitle>
              {editing.id === organization?.id
                ? "Organization manager"
                : teams.some((t) => t.id === editing.id)
                  ? `Edit ${baseline.current?.name}`
                  : "New team"}
            </DialogTitle>
            <DialogDescription>
              {editing.id === organization?.id
                ? "Choose who can report on the whole organization. Manage direct members on the Organization page."
                : "Set the name, parent and manager. You’ll review any reporting or learning changes before saving."}
            </DialogDescription>
            <form onSubmit={saveTeam} className="grid gap-4">
              {notice && <Alert variant="destructive">{notice}</Alert>}
              <FieldGroup disabled={busy}>
                {editing.id !== organization?.id && (
                  <>
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
                    <FormField label="Parent team">
                      <HierarchyPicker
                        disabled={busy}
                        value={editing.parentId || organization?.id || ""}
                        searchLabel="Find a parent team"
                        onValueChange={(value) =>
                          setEditing({
                            ...editing,
                            parentId: value || organization?.id,
                          })
                        }
                        options={[
                          {
                            id: organization?.id || "",
                            label: "Organization",
                            path: ["Organization"],
                          },
                          ...[...teams]
                            .sort(byName)
                            .filter(
                              (item) =>
                                item.id !== organization?.id &&
                                canParent(editing.id, item.id, teams),
                            )
                            .map((item) => ({
                              id: item.id,
                              label: item.name,
                              path: [...ancestorIds(item.id, teams)]
                                .reverse()
                                .map(
                                  (id) =>
                                    teams.find((value) => value.id === id)
                                      ?.name || "Unknown team",
                                ),
                            })),
                        ]}
                      />
                    </FormField>
                  </>
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
                          u.id === editing.managerId ||
                          (u.active &&
                            ["manager", "admin", "contributor"].includes(
                              u.role,
                            )),
                      )
                      .map((u) => (
                        <option
                          key={u.id}
                          value={u.id}
                          disabled={
                            !u.active ||
                            !["manager", "admin", "contributor"].includes(
                              u.role,
                            )
                          }
                        >
                          {u.name}
                          {!u.active
                            ? " (inactive)"
                            : !["manager", "admin", "contributor"].includes(
                                  u.role,
                                )
                              ? " (no longer a manager)"
                              : u.registered === false
                                ? " (not signed in)"
                                : ""}
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
                  The manager sees this team and its subteams, regardless of
                  their own team membership.
                </p>
                <ActionGroup>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void closeEditor(true)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" loading={busy}>
                    {editingNeedsReview
                      ? "Review changes"
                      : editing.id === organization?.id
                        ? "Save manager"
                        : "Save team"}
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
