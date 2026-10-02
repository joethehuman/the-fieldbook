"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { Workspace } from "@/lib/store";
import {
  isOrganizationChangeCanceled,
  type OrganizationChangeOptions,
} from "@/lib/organization-change";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import {
  effectiveGroups,
  groupTeamLinks,
  groupIncludesTeam,
  type Group,
  type LearningItem,
} from "@/lib/types";
import { expandLearning, groupItems } from "@/lib/learning-groups";
import { sourcePassages } from "@/lib/search";
import { teamPath } from "@/lib/team-hierarchy";
import {
  sortGroupBrowseItems,
  type GroupBrowseSort,
} from "@/lib/group-browse-sort";
import { SaveRecoveryError } from "@/lib/save-recovery";
import type { LearningHandler } from "./Assignments";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Alert } from "./ui/alert";
import { Checkbox } from "./ui/choice";
import { Field, FieldGroup } from "./ui/field";
import { SelectField } from "./ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableContainer,
} from "./ui/table";
import { useToast } from "./ui/toast";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { DetailNavigation } from "./patterns/detail-navigation";
import { DataTable } from "./patterns/data-table";
import { OrderedLearning } from "./patterns/ordered-learning";
import { SearchableSelectionList } from "./patterns/searchable-selection-list";
import {
  ContentSelectionList,
  type ContentSelectionOption,
} from "./patterns/content-selection-list";
import { FormField } from "./patterns/form-field";
import { SectionHeader, EmptyState, Stack } from "./patterns/layout";
import {
  CollectionControls,
  CollectionEmpty,
} from "./patterns/collection-controls";
import { Pagination } from "./patterns/pagination";
import { useRevealTarget } from "./patterns/use-reveal-target";

const PAGE_SIZE = 25;
const key = (item: LearningItem) => `${item.kind}:${item.id}`;
const byName = (
  a: { name: string; id: string },
  b: { name: string; id: string },
) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
const sorted = (ids: string[]) => [...ids].sort();
type Editor =
  | { kind: "create" | "rename"; name: string; original: string }
  | { kind: "learning" | "updates"; ids: string[]; snapshot: string }
  | {
      kind: "membership";
      teams: string[];
      people: string[];
      legacy: string[];
      expanded: string[];
      original: string;
      snapshot: string;
    };

export default function LearningGroups({
  data,
  onChange,
  onLearning,
  onLearningMany,
  initialGroup,
  registerNavigationGuard,
}: {
  data: Workspace;
  onChange: (
    data: Workspace,
    options?: OrganizationChangeOptions,
  ) => void | Promise<void>;
  onLearning: LearningHandler;
  onLearningMany?: (
    actions: import("@/lib/learning").LearningAction[],
  ) => Promise<void>;
  initialGroup?: string;
  registerNavigationGuard?: RegisterNavigationGuard;
}) {
  const [selected, setSelected] = useState(initialGroup || "");
  const [tab, setTab] = useState("people");
  const [indexQuery, setIndexQuery] = useState("");
  const [indexPage, setIndexPage] = useState(1);
  const [returnToGroup, setReturnToGroup] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [updateSort, setUpdateSort] =
    useState<GroupBrowseSort>("updated-newest");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [sourceTab, setSourceTab] = useState("people");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const saving = useRef(false);
  const guard = useRef(async () => true);
  const notify = useToast();
  const { confirm } = useInteractionDialog();
  const destination = useRevealTarget<HTMLElement>();
  const group = data.groups.find((candidate) => candidate.id === selected);
  const teams = data.teams || [];
  const content = data.publishedContent || data.content;
  const published = content.filter((item) => item.status === "published");
  const searchableContent = useMemo(
    () =>
      new Map(
        content
          .filter((item) => item.status === "published")
          .map((item) => [
            item.id,
            sourcePassages(item)
              .map((passage) =>
                [passage.title, passage.lessonTitle, passage.text]
                  .filter(Boolean)
                  .join(" "),
              )
              .join(" "),
          ]),
      ),
    [content],
  );
  const curricula = data.curricula || [];
  const items = group ? groupItems(group, content) : [];
  // The migration owns conversion. Never quietly remove inheritance in a screen render.
  const needsConversion = data.groups.some((candidate) => candidate.parentId);
  const groupMembers = useMemo(() => {
    const result = new Map<string, Workspace["users"]>();
    for (const person of data.users) {
      for (const id of effectiveGroups(person, data.groups, data.teams || [])) {
        const members = result.get(id) || [];
        members.push(person);
        result.set(id, members);
      }
    }
    return result;
  }, [data.users, data.groups, data.teams]);
  const membersOf = (candidate: Group) => groupMembers.get(candidate.id) || [];
  const members = group ? [...membersOf(group)].sort(byName) : [];
  const courseCount = (candidate: Group) =>
    new Set(
      expandLearning(groupItems(candidate, content), curricula).filter((id) =>
        published.some((item) => item.id === id && item.kind === "course"),
      ),
    ).size;
  const matches = (value: string, term = query) =>
    value.toLowerCase().includes(term.trim().toLowerCase());
  const groups = [...data.groups]
    .sort(byName)
    .filter((candidate) => matches(candidate.name, indexQuery));
  const groupPage = Math.min(
    indexPage,
    Math.max(1, Math.ceil(groups.length / PAGE_SIZE)),
  );
  const filteredMembers = members.filter((person) =>
    matches(
      `${person.name} ${person.email} ${teams.find((team) => team.id === person.teamId)?.name || ""}`,
    ),
  );
  const filteredItems = items.filter((item) => {
    if (item.kind === "course")
      return matches(
        content.find((candidate) => candidate.id === item.id)?.title ||
          "Unavailable course",
      );
    const curriculum = curricula.find((candidate) => candidate.id === item.id);
    return matches(
      [
        curriculum?.name || "Unavailable curriculum",
        ...(curriculum?.courseIds || []).map(
          (id) => content.find((candidate) => candidate.id === id)?.title || "",
        ),
      ].join(" "),
    );
  });
  const updates = group
    ? sortGroupBrowseItems(
        published
          .filter(
            (item) =>
              item.kind === "brief" &&
              item.groups.includes(group.id) &&
              matches(item.title),
          )
          .map((item) => ({ ...item, name: item.title })),
        updateSort,
      )
    : [];
  const count = tab === "people" ? filteredMembers.length : updates.length;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(count / PAGE_SIZE)));
  const membershipValue = (value: Extract<Editor, { kind: "membership" }>) =>
    JSON.stringify([
      sorted(value.teams),
      sorted(value.people),
      sorted(value.expanded),
    ]);
  const dirty =
    !!editor &&
    (editor.kind === "create" || editor.kind === "rename"
      ? editor.name !== editor.original
      : editor.kind === "membership"
        ? membershipValue(editor) !== editor.original
        : editor.kind === "learning" || editor.kind === "updates"
          ? editor.ids.length > 0
          : false);
  guard.current = async () =>
    !saving.current &&
    (!dirty || (await confirm("Discard unsaved learning group changes?")));
  useEffect(() => {
    registerNavigationGuard?.(() => guard.current(), {
      protected: dirty || busy,
    });
    return () => registerNavigationGuard?.(null);
  }, [registerNavigationGuard, dirty, busy]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || saving.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  useEffect(() => {
    if (group || !returnToGroup) return;
    const frame = requestAnimationFrame(() => {
      const row = Array.from(
        destination.targetProps.ref.current?.querySelectorAll<HTMLButtonElement>(
          "[data-group-id]",
        ) || [],
      ).find((button) => button.dataset.groupId === returnToGroup);
      if (row) {
        row.focus({ preventScroll: true });
        row.scrollIntoView({ block: "nearest" });
      } else
        destination.targetProps.ref.current?.focus({ preventScroll: true });
      setReturnToGroup("");
    });
    return () => cancelAnimationFrame(frame);
  }, [group, returnToGroup, destination.targetProps.ref]);
  const organizationSnapshot = () =>
    JSON.stringify([data.groups, data.teams, data.users]);
  const learningSnapshot = () => JSON.stringify([group, content, curricula]);

  async function run(action: () => void | Promise<void>, message: string) {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setNotice("");
    try {
      await action();
      notify(message);
      return true;
    } catch (error) {
      if (isOrganizationChangeCanceled(error)) return false;
      if (error instanceof SaveRecoveryError)
        setNotice(
          `Couldn't save this group. ${error.snapshot ? "Check the current list before trying again." : "Refresh before trying again."} ${error.message}`,
        );
      else
        setNotice(
          error instanceof Error ? error.message : "Could not save. Try again.",
        );
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const save = (
    next: Workspace,
    message = "Learning group saved.",
    options?: OrganizationChangeOptions,
  ) => run(() => onChange(next, { locallyHandled: true, ...options }), message);
  const changeGroup = (patch: Partial<Group>, message?: string) =>
    group
      ? save(
          {
            ...data,
            groups: data.groups.map((candidate) =>
              candidate.id === group.id
                ? { ...candidate, ...patch }
                : candidate,
            ),
          },
          message,
        )
      : Promise.resolve(false);
  const learnMany = async (
    actions: import("@/lib/learning").LearningAction[],
  ) => {
    if (onLearningMany) await onLearningMany(actions);
    else for (const action of actions) await onLearning(action);
  };
  function open(next: Editor) {
    setNotice("");
    setEditor(next);
  }
  async function close() {
    if (await guard.current()) {
      setEditor(null);
      setNotice("");
    }
  }
  function openGroup(id: string) {
    setSelected(id);
    setTab("people");
    setQuery("");
    setPage(1);
    setNotice("");
    destination.reveal();
  }
  function openMembership() {
    if (!group) return;
    const links = groupTeamLinks(group);
    const draft: Extract<Editor, { kind: "membership" }> = {
      kind: "membership",
      teams: [...new Set(links.map((link) => link.teamId))],
      people: data.users
        .filter((person) => person.groups.includes(group.id))
        .map((person) => person.id),
      legacy: links
        .filter((link) => link.scope === "direct")
        .map((link) => link.teamId),
      expanded: [],
      original: "",
      snapshot: organizationSnapshot(),
    };
    draft.original = membershipValue(draft);
    setSourceTab("people");
    open(draft);
  }
  async function deleteGroup() {
    if (!group) return;
    if (
      await save(
        {
          ...data,
          groups: data.groups.filter((candidate) => candidate.id !== group.id),
          users: data.users.map((person) => ({
            ...person,
            groups: person.groups.filter((id) => id !== group.id),
          })),
        },
        "Learning group deleted.",
        {
          review: {
            title: `Delete ${group.name}?`,
            description:
              "Remove this learning group and its audience links. Courses and saved completions remain.",
            confirmLabel: "Delete group",
            always: true,
          },
        },
      )
    ) {
      setSelected("");
      destination.reveal();
    }
  }
  async function applyEditor() {
    if (!editor) return;
    if (editor.kind === "create" || editor.kind === "rename") {
      const name = editor.name.trim();
      if (!name) {
        setNotice("Enter a group name.");
        return;
      }
      if (
        data.groups.some(
          (candidate) =>
            candidate.id !==
              (editor.kind === "rename" ? group?.id : undefined) &&
            candidate.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        setNotice("That group name is already in use.");
        return;
      }
      const id = editor.kind === "create" ? crypto.randomUUID() : group?.id;
      if (!id) return;
      const next =
        editor.kind === "create"
          ? [...data.groups, { id, name, learningItems: [], teamIds: [] }]
          : data.groups.map((candidate) =>
              candidate.id === id ? { ...candidate, name } : candidate,
            );
      if (
        await save(
          { ...data, groups: next },
          editor.kind === "create"
            ? "Learning group created."
            : "Learning group renamed.",
        )
      ) {
        setEditor(null);
        if (editor.kind === "create") openGroup(id);
      }
      return;
    }
    if (!group) return;
    if (editor.kind === "membership") {
      if (editor.snapshot !== organizationSnapshot()) {
        setNotice(
          "People, teams or groups changed. Close this editor and review membership again.",
        );
        return;
      }
      const legacyDirectTeamIds = editor.teams.filter(
        (id) => editor.legacy.includes(id) && !editor.expanded.includes(id),
      );
      const teamIds = editor.teams.filter(
        (id) => !legacyDirectTeamIds.includes(id),
      );
      if (
        await save(
          {
            ...data,
            groups: data.groups.map((candidate) =>
              candidate.id === group.id
                ? {
                    ...candidate,
                    teamIds,
                    legacyDirectTeamIds,
                    teamLinkScope: "subtree" as const,
                  }
                : candidate,
            ),
            users: data.users.map((person) => ({
              ...person,
              groups: editor.people.includes(person.id)
                ? [...new Set([...person.groups, group.id])]
                : person.groups.filter((id) => id !== group.id),
            })),
          },
          "Membership saved.",
        )
      )
        setEditor(null);
      return;
    }
    if (editor.kind !== "learning" && editor.kind !== "updates") return;
    if (editor.snapshot !== learningSnapshot()) {
      setNotice(
        "This group's learning or content changed. Close this picker and review your selection again.",
      );
      return;
    }
    if (editor.kind === "learning") {
      const additions = editor.ids
        .filter((id) => learningOptions.some((option) => option.id === id))
        .map((id) => ({
          kind: id.startsWith("course:")
            ? ("course" as const)
            : ("curriculum" as const),
          id: id.slice(id.indexOf(":") + 1),
        }));
      if (
        await changeGroup(
          { learningItems: [...items, ...additions] },
          "Learning added.",
        )
      )
        setEditor(null);
    } else if (
      await run(
        () =>
          learnMany(
            editor.ids.map((contentId) => ({
              operation: "target",
              contentId,
              groupId: group.id,
              expected:
                data.content.find((item) => item.id === contentId)?.revision ||
                0,
            })),
          ),
        "Updates added.",
      )
    )
      setEditor(null);
  }
  const learningOptions: ContentSelectionOption[] = [
    ...published
      .filter((item) => item.kind === "course")
      .map((item) => ({
        id: `course:${item.id}`,
        label: item.title,
        type: "course" as const,
        description: item.summary,
        category: item.category,
        updatedAt: item.updatedAt,
        searchText: searchableContent.get(item.id),
      })),
    ...curricula
      .filter((item) => item.status === "published")
      .map((item) => ({
        id: `curriculum:${item.id}`,
        label: item.name,
        type: "curriculum" as const,
        description: item.description,
        searchText: item.courseIds
          .filter((id) =>
            published.some(
              (course) => course.id === id && course.kind === "course",
            ),
          )
          .map((id) => searchableContent.get(id) || "")
          .join(" "),
      })),
  ].filter((option) => !items.some((item) => key(item) === option.id));
  const updateOptions: ContentSelectionOption[] = published
    .filter(
      (item) =>
        item.kind === "brief" && group && !item.groups.includes(group.id),
    )
    .map((item) => ({
      id: item.id,
      label: item.title,
      type: "update" as const,
      description: item.summary,
      category: item.category,
      updatedAt: item.updatedAt,
      searchText: searchableContent.get(item.id),
    }));
  const modalTitle = !editor
    ? ""
    : editor.kind === "create"
      ? "Create learning group"
      : editor.kind === "rename"
        ? "Rename learning group"
        : editor.kind === "membership"
          ? "Add Members"
          : editor.kind === "learning"
            ? "Assign Courses"
            : "Assign Updates";
  const modalDescription = !editor
    ? ""
    : editor.kind === "create" || editor.kind === "rename"
      ? "Use a unique name for this audience."
      : editor.kind === "membership"
        ? `Choose people or teams to include in ${group?.name}. Clear an existing selection to remove that membership source.`
        : editor.kind === "learning"
          ? `Assign courses or curricula to ${group?.name}. Overlapping courses count once.`
          : `Choose relevant Updates for ${group?.name}.`;
  const modalAction =
    editor?.kind === "create"
      ? "Create group"
      : editor?.kind === "rename"
        ? "Save name"
        : editor?.kind === "membership"
          ? "Review changes"
          : editor?.kind === "learning"
            ? "Review assignment"
            : "Review changes";

  return (
    <section
      {...destination.targetProps}
      className="learning-admin"
      aria-label={group?.name || "Learning groups"}
    >
      {notice && !editor && <Alert variant="destructive">{notice}</Alert>}
      {needsConversion && (
        <Alert>
          These groups still use the previous hierarchy. Convert learning groups
          before editing their audiences or learning.
        </Alert>
      )}
      {!group ? (
        <>
          <SectionHeader
            variant="page"
            title={<h2>Learning groups</h2>}
            description="Choose an audience, then choose its learning. Published content remains available to everyone with access."
          />
          <CollectionControls
            primaryAction={
              <Button
                type="button"
                disabled={busy || needsConversion}
                onClick={() => open({ kind: "create", name: "", original: "" })}
              >
                <Plus aria-hidden="true" />
                Create group
              </Button>
            }
            search={
              <FormField label="Find a group" visuallyHiddenLabel>
                <Input
                  type="search"
                  placeholder="Find a group"
                  value={indexQuery}
                  onChange={(event) => {
                    setIndexQuery(event.target.value);
                    setIndexPage(1);
                  }}
                />
              </FormField>
            }
          />
          {groups.length ? (
            <TableContainer>
              <DataTable layout="learningGroups" aria-label="Learning groups">
                <TableHeader>
                  <TableRow>
                    <TableHead>Group</TableHead>
                    <TableHead className="text-right">People</TableHead>
                    <TableHead className="text-right">Courses</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups
                    .slice((groupPage - 1) * PAGE_SIZE, groupPage * PAGE_SIZE)
                    .map((candidate) => {
                      const links = groupTeamLinks(candidate),
                        direct = data.users.filter((person) =>
                          person.groups.includes(candidate.id),
                        ).length;
                      return (
                        <TableRow key={candidate.id}>
                          <TableCell>
                            <Button
                              type="button"
                              variant="link"
                              data-group-id={candidate.id}
                              onClick={() => openGroup(candidate.id)}
                            >
                              {candidate.name}
                            </Button>
                            <p className="text-copy text-muted-foreground">
                              {links.length
                                ? `${links.length} linked ${links.length === 1 ? "team" : "teams"}`
                                : ""}
                              {links.length && direct ? " · " : ""}
                              {direct
                                ? `${direct} individually added`
                                : !links.length
                                  ? "No members yet"
                                  : ""}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {membersOf(candidate).length}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {courseCount(candidate)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </DataTable>
            </TableContainer>
          ) : (
            <CollectionEmpty
              count={0}
              total={data.groups.length}
              noun="learning groups"
              onClear={() => setIndexQuery("")}
            />
          )}
          <Pagination
            label="Learning groups"
            page={groupPage}
            pageSize={PAGE_SIZE}
            total={groups.length}
            onPageChange={setIndexPage}
          />
        </>
      ) : (
        <>
          <DetailNavigation
            current={group.name}
            disabled={busy}
            items={[
              {
                label: "All learning groups",
                onSelect: () => {
                  setSelected("");
                  setNotice("");
                  destination.reveal();
                },
              },
            ]}
          />
          <SectionHeader
            variant="page"
            title={<h2>{group.name}</h2>}
            description={`${members.length} ${members.length === 1 ? "person" : "people"} · ${courseCount(group)} ${courseCount(group) === 1 ? "course" : "courses"}`}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Group settings"
                  disabled={busy || needsConversion}
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() =>
                    open({
                      kind: "rename",
                      name: group.name,
                      original: group.name,
                    })
                  }
                >
                  Rename group
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={() => void deleteGroup()}
                >
                  Delete group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SectionHeader>
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value);
              setQuery("");
              setPage(1);
              setNotice("");
            }}
          >
            <TabsList aria-label="Learning group sections">
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="learning">Assigned Courses</TabsTrigger>
              <TabsTrigger value="updates">Assigned Updates</TabsTrigger>
            </TabsList>
            <TabsContent value="learning">
              <Stack>
                <SectionHeader
                  title={<h3>Assigned courses and curricula</h3>}
                  description="Arrange courses and curricula in the recommended order."
                />
                <CollectionControls
                  search={
                    <FormField
                      label="Find an assigned course or curriculum"
                      visuallyHiddenLabel
                    >
                      <Input
                        type="search"
                        placeholder="Find an assigned course or curriculum"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </FormField>
                  }
                  primaryAction={
                    <Button
                      type="button"
                      disabled={
                        busy || needsConversion || !learningOptions.length
                      }
                      onClick={() =>
                        open({
                          kind: "learning",
                          ids: [],
                          snapshot: learningSnapshot(),
                        })
                      }
                    >
                      <Plus aria-hidden="true" />
                      Assign Courses
                    </Button>
                  }
                />
                <OrderedLearning
                  items={filteredItems.map((item) => {
                    const curriculum =
                      item.kind === "curriculum"
                        ? curricula.find(
                            (candidate) => candidate.id === item.id,
                          )
                        : undefined;
                    return {
                      id: key(item),
                      label:
                        item.kind === "course"
                          ? content.find(
                              (candidate) => candidate.id === item.id,
                            )?.title || "Unavailable course"
                          : curriculum?.name || "Unavailable curriculum",
                      detail: curriculum ? (
                        <details>
                          <summary className="text-copy text-muted-foreground">
                            Curriculum · {curriculum.courseIds.length} courses
                          </summary>
                          <ul className="list-disc ps-5 text-copy">
                            {curriculum.courseIds.map((id) => (
                              <li key={id}>
                                {content.find(
                                  (candidate) => candidate.id === id,
                                )?.title || "Unavailable course"}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        "Course"
                      ),
                    };
                  })}
                  disabled={busy || needsConversion}
                  reorderDisabled={!!query.trim()}
                  onReorder={(ids) =>
                    void changeGroup(
                      {
                        learningItems: ids.map((id) =>
                          items.find((item) => key(item) === id)!,
                        ),
                      },
                      "Learning order saved.",
                    )
                  }
                  onRemove={(id) =>
                    void changeGroup(
                      {
                        learningItems: items.filter((item) => key(item) !== id),
                      },
                      "Learning removed from group.",
                    )
                  }
                />
                {!filteredItems.length &&
                  (items.length ? (
                    <CollectionEmpty
                      count={0}
                      total={items.length}
                      noun="assigned courses or curricula"
                      onClear={() => setQuery("")}
                    />
                  ) : (
                    <EmptyState>
                      Assign courses or a curriculum to this audience.
                    </EmptyState>
                  ))}
              </Stack>
            </TabsContent>
            <TabsContent value="people">
              <Stack>
                <SectionHeader
                  title={<h3>People in this group</h3>}
                  description="People can be included through a team, individually, or both."
                />
                <CollectionControls
                  primaryAction={
                    <Button
                      type="button"
                      disabled={busy || needsConversion}
                      onClick={openMembership}
                    >
                      <Plus aria-hidden="true" />
                      Add Members
                    </Button>
                  }
                  search={
                    <FormField label="Find a person" visuallyHiddenLabel>
                      <Input
                        type="search"
                        placeholder="Search name, email or team"
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setPage(1);
                        }}
                      />
                    </FormField>
                  }
                />
                {filteredMembers.length ? (
                  <TableContainer>
                    <DataTable layout="groupMembers" aria-label="Group members">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Person</TableHead>
                          <TableHead>Reporting team</TableHead>
                          <TableHead>Included through</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMembers
                          .slice(
                            (currentPage - 1) * PAGE_SIZE,
                            currentPage * PAGE_SIZE,
                          )
                          .map((person) => {
                            const sources = [
                              person.groups.includes(group.id) ? "Direct" : "",
                              groupIncludesTeam(group, person.teamId, teams)
                                ? "Team"
                                : "",
                            ].filter(Boolean);
                            return (
                              <TableRow key={person.id}>
                                <TableCell>
                                  <strong>{person.name}</strong>
                                  <p className="text-copy text-muted-foreground">
                                    {person.email}
                                    {!person.active
                                      ? " · Inactive"
                                      : person.registered === false
                                        ? " · Not signed in"
                                        : ""}
                                  </p>
                                </TableCell>
                                <TableCell>
                                  {person.teamId
                                    ? teams.find(
                                        (team) => team.id === person.teamId,
                                      )?.name || "Unknown team"
                                    : "No reporting team"}
                                </TableCell>
                                <TableCell>{sources.join(" · ")}</TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </DataTable>
                  </TableContainer>
                ) : (
                  <CollectionEmpty
                    count={0}
                    total={members.length}
                    noun="people"
                    onClear={() => setQuery("")}
                  />
                )}
                <Pagination
                  label="Group members"
                  page={currentPage}
                  pageSize={PAGE_SIZE}
                  total={filteredMembers.length}
                  onPageChange={setPage}
                />
              </Stack>
            </TabsContent>
            <TabsContent value="updates">
              <Stack>
                <SectionHeader
                  title={<h3>Assigned Updates</h3>}
                  description="Relevant Updates appear in members’ For you feed."
                />
                <CollectionControls
                  primaryAction={
                    <Button
                      type="button"
                      disabled={
                        busy || needsConversion || !updateOptions.length
                      }
                      onClick={() =>
                        open({
                          kind: "updates",
                          ids: [],
                          snapshot: learningSnapshot(),
                        })
                      }
                    >
                      <Plus aria-hidden="true" />
                      Assign Updates
                    </Button>
                  }
                  search={
                    <FormField
                      label="Find an assigned update"
                      visuallyHiddenLabel
                    >
                      <Input
                        type="search"
                        placeholder="Find an assigned update"
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setPage(1);
                        }}
                      />
                    </FormField>
                  }
                  sortLabel={
                    updateSort === "title"
                      ? "Title A–Z"
                      : updateSort === "updated-newest"
                        ? "Updated newest"
                        : "Created newest"
                  }
                  sort={
                    <FormField label="Sort Updates">
                      <SelectField
                        value={updateSort}
                        onValueChange={(value) => {
                          setUpdateSort(value as GroupBrowseSort);
                          setPage(1);
                        }}
                      >
                        <option value="updated-newest">
                          Updated newest first
                        </option>
                        <option value="created-newest">
                          Created newest first
                        </option>
                        <option value="title">Title A–Z</option>
                      </SelectField>
                    </FormField>
                  }
                />
                {updates.length ? (
                  <TableContainer>
                    <DataTable
                      layout="groupUpdates"
                      aria-label="Assigned Updates"
                    >
                      <TableHeader>
                        <TableRow>
                          <TableHead>Update</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>
                            <span className="sr-only">Actions</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {updates
                          .slice(
                            (currentPage - 1) * PAGE_SIZE,
                            currentPage * PAGE_SIZE,
                          )
                          .map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>{item.title}</TableCell>
                              <TableCell>{item.category || "—"}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  disabled={busy || needsConversion}
                                  aria-label={`Remove ${item.title} from group`}
                                  onClick={() =>
                                    void run(
                                      () =>
                                        learnMany([
                                          {
                                            operation: "untarget",
                                            contentId: item.id,
                                            groupId: group.id,
                                            expected:
                                              data.content.find(
                                                (candidate) =>
                                                  candidate.id === item.id,
                                              )?.revision || 0,
                                          },
                                        ]),
                                      "Update removed from group.",
                                    )
                                  }
                                >
                                  <Trash2 aria-hidden="true" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </DataTable>
                  </TableContainer>
                ) : (
                  <CollectionEmpty
                    count={0}
                    total={
                      published.filter(
                        (item) =>
                          item.kind === "brief" &&
                          item.groups.includes(group.id),
                      ).length
                    }
                    noun="Updates"
                    onClear={() => setQuery("")}
                  />
                )}
                <Pagination
                  label="Group Updates"
                  page={currentPage}
                  pageSize={PAGE_SIZE}
                  total={updates.length}
                  onPageChange={setPage}
                />
              </Stack>
            </TabsContent>
          </Tabs>
        </>
      )}
      <Dialog
        open={!!editor}
        onOpenChange={(value) => {
          if (!value) void close();
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>{modalDescription}</DialogDescription>
          {notice && <Alert variant="destructive">{notice}</Alert>}
          {(editor?.kind === "create" || editor?.kind === "rename") && (
            <form
              id="learning-group-name"
              onSubmit={(event) => {
                event.preventDefault();
                void applyEditor();
              }}
            >
              <FormField label="Group name">
                <Input
                  required
                  maxLength={80}
                  disabled={busy}
                  value={editor.name}
                  placeholder="e.g. Account executives"
                  onChange={(event) =>
                    setEditor({ ...editor, name: event.target.value })
                  }
                />
              </FormField>
            </form>
          )}
          {editor?.kind === "membership" && (
            <Tabs value={sourceTab} onValueChange={setSourceTab}>
              <TabsList aria-label="Membership sources">
                <TabsTrigger value="people">People</TabsTrigger>
                <TabsTrigger value="teams">Teams</TabsTrigger>
              </TabsList>
              <TabsContent value="teams">
                <Stack>
                  <p className="text-copy text-muted-foreground">
                    Linked teams include their current and future subteams.
                  </p>
                  {editor.legacy.some((id) => editor.teams.includes(id)) && (
                    <FieldGroup disabled={busy}>
                      <p className="text-copy text-muted-foreground">
                        These older links include direct members only. Choose
                        which links should also include subteams.
                      </p>
                      {editor.legacy
                        .filter((id) => editor.teams.includes(id))
                        .map((id) => (
                          <Field key={id} orientation="horizontal">
                            <Checkbox
                              checked={editor.expanded.includes(id)}
                              onCheckedChange={(value) =>
                                setEditor({
                                  ...editor,
                                  expanded:
                                    value === true
                                      ? [...editor.expanded, id]
                                      : editor.expanded.filter(
                                          (item) => item !== id,
                                        ),
                                })
                              }
                            />
                            Include subteams for{" "}
                            {teams.find((team) => team.id === id)?.name ||
                              "Unknown team"}
                          </Field>
                        ))}
                    </FieldGroup>
                  )}
                  <SearchableSelectionList
                    key={`${group?.id}:teams`}
                    label="Find a team"
                    placeholder="Search teams"
                    emptyMessage="No matching teams."
                    disabled={busy}
                    options={[...teams].sort(byName).map((team) => ({
                      id: team.id,
                      label: team.name,
                      description: `${teamPath(team.id, teams)}${editor.legacy.includes(team.id) && !editor.expanded.includes(team.id) ? " · Direct members only" : " · Includes subteams"}`,
                    }))}
                    value={editor.teams}
                    onChange={(ids) => setEditor({ ...editor, teams: ids })}
                  />
                </Stack>
              </TabsContent>
              <TabsContent value="people">
                <SearchableSelectionList
                  key={`${group?.id}:people`}
                  label="Find a person"
                  placeholder="Search name, email or team"
                  emptyMessage="No matching people."
                  disabled={busy}
                  options={[...data.users].sort(byName).map((person) => ({
                    id: person.id,
                    label: person.name,
                    description: `${person.email} · ${teams.find((team) => team.id === person.teamId)?.name || "No reporting team"}${!person.active ? " · Inactive" : ""}`,
                  }))}
                  value={editor.people}
                  onChange={(ids) => setEditor({ ...editor, people: ids })}
                />
              </TabsContent>
              <p className="text-copy text-muted-foreground">
                {editor.teams.length} teams · {editor.people.length}{" "}
                individually added. Removing one source keeps anyone included
                through another.
              </p>
            </Tabs>
          )}
          {(editor?.kind === "learning" || editor?.kind === "updates") && (
            <ContentSelectionList
              label={
                editor.kind === "learning"
                  ? "Find courses or curricula"
                  : "Find Updates"
              }
              showTypeFilter={editor.kind === "learning"}
              disabled={busy}
              options={
                editor.kind === "learning" ? learningOptions : updateOptions
              }
              value={editor.ids}
              onChange={(ids) => setEditor({ ...editor, ids })}
            />
          )}
          <DialogFooter className="justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void close()}
            >
              Cancel
            </Button>
            {editor && (
              <Button
                type={
                  editor.kind === "create" || editor.kind === "rename"
                    ? "submit"
                    : "button"
                }
                form={
                  editor.kind === "create" || editor.kind === "rename"
                    ? "learning-group-name"
                    : undefined
                }
                loading={busy}
                disabled={!dirty || needsConversion}
                onClick={
                  editor.kind === "create" || editor.kind === "rename"
                    ? undefined
                    : () => void applyEditor()
                }
              >
                {modalAction}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
