"use client";
import { DetailNavigation } from "./patterns/detail-navigation";
import { BulkActions } from "./patterns/bulk-actions";
import { SelectableRows } from "./patterns/selectable-rows";
import { groupLearningCommands } from "./bulk-relationships";
import { useBulkSelection } from "./patterns/bulk-selection";
import { BulkPicker } from "./patterns/bulk-selection";
import { Note } from "@/components/ui/note";
import { FormField } from "@/components/patterns/form-field";
import { useToast } from "./ui/toast";
import { OrderedLearning } from "./patterns/ordered-learning";
import { SelectField } from "./ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { useRevealTarget } from "./patterns/use-reveal-target";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldDescription } from "@/components/ui/field";
import { CollectionControls, CollectionEmpty } from "./patterns/collection-controls";
import { SectionHeader, EmptyState } from "@/components/patterns/layout";
import { Alert } from "@/components/ui/alert";
import { ActionGroup } from "@/components/ui/action-group";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import type { Workspace } from "@/lib/store";
import {
  ancestorIds,
  canParent,
  effectiveGroups,
  type Group,
  type LearningItem,
} from "@/lib/types";
import { expandLearning, groupItems } from "@/lib/learning-groups";
import {
  sortGroupBrowseItems,
  type GroupBrowseSort,
} from "@/lib/group-browse-sort";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./ui/dialog";
import { useInteractionDialog } from "./ui/interaction-dialog";
import type { LearningHandler } from "./Assignments";
import { SaveRecoveryError } from "@/lib/save-recovery";
import { HierarchyList, hierarchyMatches } from "./patterns/hierarchy-list";
import { groupMembershipSources, groupMoveImpact, groupPath, moveGroup } from "@/lib/group-hierarchy";
import { teamPath } from "@/lib/team-hierarchy";

const key = (i: LearningItem) => `${i.kind}:${i.id}`;
export default function LearningGroups({
  data,
  onChange,
  onLearning,
  onLearningMany,
  initialGroup,
}: {
  data: Workspace;
  onChange: (
    d: Workspace,
    options?: { locallyHandled?: boolean },
  ) => void | Promise<void>;
  onLearning: LearningHandler;
  onLearningMany?: (
    actions: import("@/lib/learning").LearningAction[],
  ) => Promise<void>;
  initialGroup?: string;
}) {
  const destination = useRevealTarget<HTMLElement>();
  const notify = useToast();
  const { confirm, prompt } = useInteractionDialog();
  const [hierarchyQuery, setHierarchyQuery] = useState("");
  const [selected, setSelected] = useState(initialGroup || "");
  const [tab, setTab] = useState("learning");
  const [query, setQuery] = useState("");
  const [memberSort, setMemberSort] = useState("name");
  const [updateSort, setUpdateSort] =
    useState<GroupBrowseSort>("created-newest");
  const [name, setName] = useState("");
  const [createParent, setCreateParent] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [moveParent, setMoveParent] = useState<string | null>(null);
  const [linkedOpen, setLinkedOpen] = useState(true);
  const [childrenOpen, setChildrenOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const learnMany =
    onLearningMany ||
    (async (actions: import("@/lib/learning").LearningAction[]) => {
      for (const action of actions) await onLearning(action);
    });
  const group = data.groups.find((g) => g.id === selected);
  const content = data.publishedContent || data.content;
  const published = content.filter((c) => c.status === "published");
  const curricula = data.curricula || [];
  const items = group ? groupItems(group, content) : [];
  async function save(next: Workspace, message = "Learning group saved.") {
    setBusy(true);
    setNotice("");
    try {
      await onChange(next, { locallyHandled: true });
      setNotice("");
      notify(message);
      return true;
    } catch (e) {
      if (e instanceof SaveRecoveryError) {
        const reference = e.message.match(/Reference: ([a-f0-9-]{36})\./)?.[1];
        setNotice(
          `Couldn't save this group. ${e.snapshot ? "Check the current list before trying again." : "Refresh before trying again."}${reference ? ` Reference: ${reference}.` : ""}`,
        );
      } else {
        setNotice((e as Error).message);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function bulkSave(next: Workspace) {
    setNotice("");
    await onChange(next, { locallyHandled: true });
    return true;
  }
  const bulkChangeGroup = (patch: Partial<Group>) =>
    group &&
    bulkSave({
      ...data,
      groups: data.groups.map((g) =>
        g.id === group.id ? { ...g, ...patch } : g,
      ),
    });
  const changeGroup = (patch: Partial<Group>) =>
    group &&
    save({
      ...data,
      groups: data.groups.map((g) =>
        g.id === group.id ? { ...g, ...patch } : g,
      ),
    });
  async function deleteGroup(g: Group) {
    const members = data.users.filter((u) =>
      effectiveGroups(u, data.groups).has(g.id),
    ).length;
    if (
      !(await confirm(
        `Delete ${g.name}? This removes its assignments and audience tags for ${members} people. Child groups move to its parent. Courses and learning history are preserved.`,
      ))
    )
      return;
    const ok = await save(
      {
        ...data,
        groups: data.groups
          .filter((x) => x.id !== g.id)
          .map((x) =>
            x.parentId === g.id ? { ...x, parentId: g.parentId } : x,
          ),
        users: data.users.map((u) => ({
          ...u,
          groups: u.groups.filter((id) => id !== g.id),
        })),
      },
      "Learning group deleted. Learning history preserved.",
    );
    if (ok) {
      setSelected("");
      destination.reveal();
    }
  }
  const matches = (name: string) =>
    name.toLowerCase().includes(query.trim().toLowerCase());
  const linkedTeams = (data.teams || []).filter((t) =>
    group?.teamIds?.includes(t.id),
  ).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const groupMembers = data.users.filter(
    (u) =>
      group &&
      effectiveGroups(u, data.groups).has(group.id) &&
      matches(u.name + " " + u.email),
  ).sort((a, b) => (memberSort === "reverse" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)) || a.id.localeCompare(b.id));
  const groupUpdates = sortGroupBrowseItems(
    published
      .filter(
        (c) =>
          c.kind === "brief" &&
          group &&
          c.groups.includes(group.id) &&
          matches(c.title),
      )
      .map((c) => ({ ...c, name: c.title })),
    updateSort,
  );
  const teamSelection = useBulkSelection(
    selected + tab,
    linkedTeams.map((t) => t.id),
  );
  const peopleSelection = useBulkSelection(
    selected + tab + query,
    groupMembers.map((u) => u.id),
    groupMembers
      .filter((u) => group && u.groups.includes(group.id))
      .map((u) => u.id),
  );
  const learningSelection = useBulkSelection(selected + tab, items.map(key));
  const updateSelection = useBulkSelection(
    selected + tab + query,
    groupUpdates.map((c) => c.id),
  );
  const hierarchyItems = [...data.groups].sort((a, b) => a.name.localeCompare(b.name)).map((g) => ({
              id: g.id,
              parentId: g.parentId,
              label: g.name,
              description: groupPath(g.id, data.groups),
              meta: `${data.users.filter((u) => u.active && effectiveGroups(u, data.groups).has(g.id)).length} active people · ${data.groups.filter((child) => child.parentId === g.id).length} child groups · ${expandLearning(groupItems(g, content), curricula).filter((id) => published.some((c) => c.id === id)).length} direct assigned courses`,
            }));
  const overviewSelection = useBulkSelection(
    selected + hierarchyQuery,
    hierarchyMatches(hierarchyItems, hierarchyQuery).map((item) => item.id),
  );
  const parentGroups = group ? [...data.groups]
    .filter((g) => g.id !== group.id && canParent(group.id, g.id, data.groups))
    .sort((a, b) => groupPath(a.id, data.groups).localeCompare(groupPath(b.id, data.groups))) : [];
  const selectedMove = group && moveParent !== null ? (() => {
    try { return groupMoveImpact(data, group.id, moveParent || undefined); }
    catch { return null; }
  })() : null;
  const childGroups = group ? data.groups.filter((g) => g.parentId === group.id).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) : [];
  const inheritedGroups = group ? [...data.groups].filter((g) => g.id !== group.id && canParent(g.id, group.id, data.groups) === false) : [];
  function closeCreate() {
    if (busy) return;
    setCreateOpen(false);
    setName("");
    setCreateParent("");
    setNotice("");
  }
  return (
    <section
      {...destination.targetProps}
      aria-label={group ? group.name : "Learning groups"}
      className="learning-admin"
    >
      {notice && !createOpen && <Alert variant="destructive">{notice}</Alert>}
      {!group ? (
        <>
          <SectionHeader
            variant="page"
            title={<h2>Learning groups</h2>}
            description={
              <>
                Choose who courses and updates are for. Everyone can explore the
                full library.
              </>
            }
          ></SectionHeader>
          <HierarchyList
            query={hierarchyQuery}
            onQueryChange={setHierarchyQuery}
            selectionActions={
<BulkActions
            singleItemActions={false}
            collectionSize={overviewSelection.collectionSize}
            selected={overviewSelection.actionIds}
            onSelectionChange={overviewSelection.setSelected}
            noun="groups"
            commands={groupLearningCommands(
              data,
              overviewSelection.actionIds,
              onChange,
              learnMany,
            ).concat([{
              id: "move",
              label: "Move selected groups",
              description: "Move each selected branch to one parent. Child groups follow their parent; inherited learning and Update relevance may change. Direct links and history stay attached.",
              options: [{ id: "root", label: "Top level" }, ...data.groups.map((g) => ({ id: g.id, label: groupPath(g.id, data.groups) }))],
              selectionMode: "single" as const,
              review: (values: string[], ids: string[]) => {
                try {
                  if (ids.some((id) => [...ancestorIds(id, data.groups)].some((ancestor) => ancestor !== id && ids.includes(ancestor))))
                    throw new Error("Select a parent or a descendant, not both.");
                  const destination = values[0] === "root" ? undefined : values[0];
                  let working = data;
                  const impacts = ids.map((id) => {
                    const impact = groupMoveImpact(working, id, destination);
                    working = { ...working, groups: impact.next };
                    return impact;
                  });
                  return <ul className="text-copy">{impacts.map((impact) => <li key={impact.from}>{impact.from} → {impact.to} · {impact.branch.length} groups · {impact.gainedCourses} new / {impact.lostCourses} removed effective course assignments · {impact.gainedUpdates} added / {impact.lostUpdates} removed Update links{impact.guest && ` · guest recommendations: ${impact.guest.gainedCourses} added / ${impact.guest.lostCourses} removed courses`}</li>)}</ul>;
                } catch (error) { return <p role="alert">{(error as Error).message}</p>; }
              },
              apply: async (values: string[], ids: string[] = []) => {
                if (ids.some((id) => [...ancestorIds(id, data.groups)].some((ancestor) => ancestor !== id && ids.includes(ancestor))))
                  throw new Error("Select either a parent or its child group, not both.");
                const destination = values[0] === "root" ? undefined : values[0];
                let next = data.groups;
                for (const id of ids) next = moveGroup(next, id, destination);
                await onChange({ ...data, groups: next }, { locallyHandled: true });
              },
            }])}
          />
            }
            label="Learning groups"
            searchAction={
              <Button type="button" disabled={busy} onClick={() => { setCreateParent(""); setNotice(""); setCreateOpen(true); }}>
                <Plus aria-hidden="true" />
                Create group
              </Button>
            }
            items={hierarchyItems}
            selected={overviewSelection.selected}
            onSelectionChange={overviewSelection.setSelected}
            disabled={busy}
            onOpen={(id) => { setSelected(id); destination.reveal(); setQuery(""); setNotice(""); }}
          />
        </>
      ) : (
        <>
          <DetailNavigation
            disabled={busy}
            items={[
              { label: "All learning groups", onSelect: () => {
                setSelected("");
                destination.reveal();
                setQuery("");
                setMoveParent(null);
              } },
              ...(group.parentId ? [{
                label: `Parent: ${groupPath(group.parentId, data.groups)}`,
                onSelect: () => {
                  setSelected(group.parentId!);
                  destination.reveal();
                  setQuery("");
                  setNotice("");
                  setMoveParent(null);
                },
              }] : []),
            ]}
            current={group.name}
          />
          <SectionHeader
            variant="page"
            title={<h2>{group.name}</h2>}
            description={
              <>Members receive this group’s courses and Updates in For you.</>
            }
          >
            <ActionGroup>
              <Button
                disabled={busy}
                onClick={() => { setCreateParent(group.id); setNotice(""); setCreateOpen(true); }}
              >
                <Plus aria-hidden="true" />
                Add child group
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setMoveParent(group.parentId || "")}>Move group</Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  const value = (
                    await prompt("Learning group name", group.name)
                  )?.trim();
                  if (value) {
                    if (
                      data.groups.some(
                        (g) =>
                          g.id !== group.id &&
                          g.name.toLowerCase() === value.toLowerCase(),
                      )
                    ) {
                      setNotice("That group already exists.");
                      return;
                    }
                    await changeGroup({ name: value });
                  }
                }}
              >
                Rename
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => deleteGroup(group)}
              >
                Delete group
              </Button>
            </ActionGroup>
          </SectionHeader>
          {moveParent !== null && (
            <div className="grid gap-3 rounded-lg border border-border p-4">
              <h3>Review group move</h3>
              <p className="text-copy text-muted-foreground">The whole child-group branch moves. Direct members, linked teams, and learning history stay attached. Inherited assignments and Update relevance may change.</p>
              <FormField label="New parent group">
                <SelectField value={moveParent} onValueChange={setMoveParent} disabled={busy}>
                  <option value="">Top level</option>
                  {parentGroups.map((g) => <option key={g.id} value={g.id}>{groupPath(g.id, data.groups)}</option>)}
                </SelectField>
              </FormField>
              {selectedMove ? (
                <div className="grid gap-1 text-copy">
                  <p>{selectedMove.from} → {selectedMove.to}</p>
                  <p>{selectedMove.branch.length} groups in this branch.</p>
                  <p>{selectedMove.gainedCourses} new and {selectedMove.lostCourses} removed effective course assignments across members; {selectedMove.gainedUpdates} added and {selectedMove.lostUpdates} removed Update relevance links. Overlaps are counted once.</p>
                  {selectedMove.guest && <p>Guest recommendations: {selectedMove.guest.gainedCourses} added / {selectedMove.guest.lostCourses} removed courses; {selectedMove.guest.gainedUpdates} added / {selectedMove.guest.lostUpdates} removed Updates.</p>}
                </div>
              ) : <p role="alert">Choose a different valid parent.</p>}
              <ActionGroup>
                <Button variant="outline" disabled={busy} onClick={() => setMoveParent(null)}>Cancel</Button>
                <Button disabled={busy || !selectedMove} onClick={async () => {
                  if (!selectedMove) return;
                  if (await save({ ...data, groups: selectedMove.next }, "Learning group moved.")) setMoveParent(null);
                }}>Apply move</Button>
              </ActionGroup>
            </div>
          )}
          <div className="grid gap-2">
            <div className="flex items-center gap-2"><Button type="button" variant="ghost" size="icon" aria-label={`${childrenOpen ? "Collapse" : "Expand"} child groups`} aria-expanded={childrenOpen} onClick={() => setChildrenOpen((value) => !value)}><ChevronRight className={childrenOpen ? "rotate-90" : ""} aria-hidden="true" /></Button><h3>Child groups · {childGroups.length}</h3></div>
            {childrenOpen && (childGroups.length ? childGroups.map((child) => (
              <Button key={child.id} variant="link" className="justify-start" onClick={() => { setSelected(child.id); setMoveParent(null); setQuery(""); setNotice(""); destination.reveal(); }}>
                {groupPath(child.id, data.groups)}
              </Button>
            )) : <p className="text-copy text-muted-foreground">No child groups.</p>)}
          </div>
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value);
              destination.reveal(false);
              setQuery("");
            }}
          >
            <TabsList aria-label="Learning group sections">
              {["members", "learning", "updates"].map((t) => (
                <TabsTrigger value={t} key={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value={tab} key={tab}>
              <FieldGroup disabled={busy}>
                {tab === "members" ? (
                  <>
                    <p className="text-copy text-muted-foreground">Parent: {group.parentId ? groupPath(group.parentId, data.groups) : "Top level"}. Child-group members are included here; this group’s direct members do not automatically join its children.</p>
                    <div className="flex items-center gap-2"><Button type="button" variant="ghost" size="icon" aria-label={`${linkedOpen ? "Collapse" : "Expand"} linked teams`} aria-expanded={linkedOpen} onClick={() => setLinkedOpen((value) => !value)}><ChevronRight className={linkedOpen ? "rotate-90" : ""} aria-hidden="true" /></Button><h3>Linked teams · {linkedTeams.length}</h3></div>
                    <FieldDescription>
                      Linked teams supply their direct members. Child teams must
                      be linked separately.
                    </FieldDescription>
                    <ActionGroup>
                      <BulkPicker
                        title="Add teams"
                        description="Link the selected teams to this learning group. Their direct members receive its assignments and updates."
                        options={(data.teams || [])
                          .filter((t) => !group.teamIds?.includes(t.id))
                          .map((t) => ({ id: t.id, label: teamPath(t.id, data.teams || []) }))}
                        onApply={async (ids) => {
                          if (
                            !(await bulkChangeGroup({
                              teamIds: [
                                ...new Set([...(group.teamIds || []), ...ids]),
                              ],
                            }))
                          )
                            throw new Error(
                              "Could not save. Review the group before retrying.",
                            );
                        }}
                        actionLabel="Add teams"
                      />
                    </ActionGroup>
                    {linkedOpen && <><BulkActions
                      collectionSize={teamSelection.collectionSize}
                      selected={teamSelection.actionIds}
                      onSelectionChange={teamSelection.setSelected}
                      commands={[
                        {
                          id: "remove",
                          label: "Remove team links",
                          description:
                            "Remove these direct links. Individual and inherited membership and history remain.",
                          apply: async () => {
                            if (
                              !(await bulkChangeGroup({
                                teamIds: group.teamIds?.filter(
                                  (id) => !teamSelection.actionIds.includes(id),
                                ),
                              }))
                            )
                              throw new Error("Could not save team links.");
                          },
                        },
                      ]}
                    />
                    <SelectableRows
                      label="Linked teams"
                      rows={linkedTeams.map((t) => ({
                        id: t.id,
                        label: teamPath(t.id, data.teams || []),
                        detail: `${data.users.filter((u) => u.teamId === t.id && u.active).length} direct active people. Child teams are linked separately.`,
                      }))}
                      selected={teamSelection.selected}
                      onChange={teamSelection.setSelected}
                    /></>}
                    <h3>People</h3>
                    <ActionGroup>
                      <BulkPicker
                        title="Add people"
                        description="Add individual memberships. Overlapping team and group assignments are deduplicated."
                        options={data.users
                          .filter(
                            (u) => u.active && !u.groups.includes(group.id),
                          )
                          .map((u) => ({
                            id: u.id,
                            label: u.name,
                            description: u.email,
                          }))}
                        onApply={async (ids) => {
                          if (
                            !(await bulkSave({
                              ...data,
                              users: data.users.map((u) =>
                                ids.includes(u.id)
                                  ? {
                                      ...u,
                                      groups: [
                                        ...new Set([...u.groups, group.id]),
                                      ],
                                    }
                                  : u,
                              ),
                            }))
                          )
                            throw new Error(
                              "Could not save. Review the group before retrying.",
                            );
                        }}
                        actionLabel="Add people"
                      />
                    </ActionGroup>
                    <CollectionControls sortLabel={memberSort === "name" ? "Name A–Z" : "Name Z–A"} sort={<FormField label="Sort group members"><SelectField value={memberSort} onValueChange={setMemberSort}><option value="name">Name A–Z</option><option value="reverse">Name Z–A</option></SelectField></FormField>} search={                    <FormField label="Find a member">
                      <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search name or email"
                      />
                    </FormField>} filters={query ? [{ id: "query", label: `Search: ${query}`, onRemove: () => setQuery("") }] : []} onClear={() => setQuery("")} />
                    <BulkActions
                      collectionSize={peopleSelection.collectionSize}
                      selected={peopleSelection.actionIds}
                      onSelectionChange={peopleSelection.setSelected}
                      commands={[
                        {
                          id: "remove",
                          label: "Remove from group",
                          description:
                            "Remove direct memberships. People included through a team or child group remain included; history is preserved.",
                          apply: async () => {
                            if (
                              !(await bulkSave({
                                ...data,
                                users: data.users.map((u) =>
                                  peopleSelection.actionIds.includes(u.id)
                                    ? {
                                        ...u,
                                        groups: u.groups.filter(
                                          (id) => id !== group.id,
                                        ),
                                      }
                                    : u,
                                ),
                              }))
                            )
                              throw new Error("Could not save memberships.");
                          },
                        },
                      ]}
                    />
                    <SelectableRows
                      label="Group members"
                      empty={<CollectionEmpty count={groupMembers.length} total={data.users.filter((u) => effectiveGroups(u, data.groups).has(group.id)).length} noun="group members" onClear={() => setQuery("")} />}
                      scope={query + memberSort}
                      selected={peopleSelection.selected}
                      onChange={peopleSelection.setSelected}
                      rows={groupMembers.map((u) => ({
                        id: u.id,
                        label: u.name,
                        detail: <>{u.email} · {u.active ? "Active" : "Inactive"}<br />{groupMembershipSources(u, group.id, data).join(" · ")}</>,
                        disabledReason: !u.groups.includes(group.id)
                          ? "Included through a team or child group; manage that source to remove membership."
                          : undefined,
                      }))}
                    />
                    <p className="text-copy text-muted-foreground">{groupMembers.filter((u) => u.active).length} active · {groupMembers.filter((u) => !u.active).length} inactive · {(data.pendingUsers || []).filter((u) => u.groups.includes(group.id) || (!!u.teamId && !!group.teamIds?.includes(u.teamId))).length} pending direct memberships</p>
                  </>
                ) : tab === "learning" ? (
                  <>
                    <h3>Recommended sequence</h3>
                    <ActionGroup>
                      <BulkPicker
                        title="Add courses or curricula"
                        description="Append selected items to the recommended sequence. Overlapping courses count once."
                        options={[
                          ...published
                            .filter((c) => c.kind === "course")
                            .map((c) => ({
                              id: `course:${c.id}`,
                              label: c.title,
                              description: "Course",
                            })),
                          ...curricula
                            .filter((c) => c.status === "published")
                            .map((c) => ({
                              id: `curriculum:${c.id}`,
                              label: c.name,
                              description: "Curriculum",
                            })),
                        ].filter((o) => !items.some((i) => key(i) === o.id))}
                        onApply={async (ids) => {
                          if (
                            !(await bulkChangeGroup({
                              learningItems: [
                                ...items,
                                ...ids.map((id) => ({
                                  kind: id.startsWith("course:")
                                    ? ("course" as const)
                                    : ("curriculum" as const),
                                  id: id.slice(id.indexOf(":") + 1),
                                })),
                              ],
                            }))
                          )
                            throw new Error("Could not save the sequence.");
                        }}
                        actionLabel="Add items"
                      />
                    </ActionGroup>
                    <FieldDescription>
                      Add courses or reusable curricula. Reorder to recommend
                      what to take next. Every course stays available.
                    </FieldDescription>
                    {group.parentId && (
                      <Note>
                        Courses from parent groups come first. Manage them in their owning group.
                      </Note>
                    )}
                    {inheritedGroups.filter((g) => groupItems(g, content).length).map((owner) => (
                      <div key={owner.id} className="rounded-md border border-border p-3 text-copy">
                        <p>Inherited from {groupPath(owner.id, data.groups)}</p>
                        <ul className="list-disc ps-5">
                          {groupItems(owner, content).map((item) => {
                            const curriculum = item.kind === "curriculum" ? curricula.find((c) => c.id === item.id) : undefined;
                            return <li key={key(item)}>{item.kind === "course" ? content.find((c) => c.id === item.id)?.title || "Unavailable course" : `${curriculum?.name || "Unavailable curriculum"} · ${curriculum?.courseIds.map((id) => content.find((c) => c.id === id)?.title || "Unavailable course").join(", ") || "No courses"}`}</li>;
                          })}
                        </ul>
                      </div>
                    ))}
                    <BulkActions
                      singleItemActions={false}
                      collectionSize={learningSelection.collectionSize}
                      selected={learningSelection.actionIds}
                      onSelectionChange={learningSelection.setSelected}
                      commands={[
                        {
                          id: "remove",
                          label: "Remove from group",
                          description:
                            "Remove these direct learning links. Inherited assignments and history remain.",
                          apply: async () => {
                            if (
                              !(await bulkChangeGroup({
                                learningItems: items.filter(
                                  (i) =>
                                    !learningSelection.actionIds.includes(
                                      key(i),
                                    ),
                                ),
                              }))
                            )
                              throw new Error("Could not save learning items.");
                          },
                        },
                      ]}
                    />
                    <OrderedLearning
                      selected={learningSelection.selected}
                      onSelectionChange={learningSelection.setSelected}
                      items={items.map((i) => ({
                        id: key(i),
                        label:
                          i.kind === "course"
                            ? content.find((c) => c.id === i.id)?.title ||
                              "Unavailable course"
                            : curricula.find((c) => c.id === i.id)?.name ||
                              "Unavailable curriculum",
                        detail:
                          i.kind === "curriculum"
                            ? `Curriculum · ${curricula.find((c) => c.id === i.id)?.courseIds.map((id) => content.find((c) => c.id === id)?.title || "Unavailable course").join(", ") || "No courses"}`
                            : "Course",
                      }))}
                      disabled={busy}
                      onReorder={(ids) =>
                        changeGroup({
                          learningItems: ids.map((id) =>
                            items.find((i) => key(i) === id)!,
                          ),
                        })
                      }
                      onRemove={(id) =>
                        changeGroup({
                          learningItems: items.filter((i) => key(i) !== id),
                        })
                      }
                    />
                    {!items.length && (
                      <EmptyState>
                        No assigned courses yet. Add a course or curriculum
                        using Add courses or curricula.
                      </EmptyState>
                    )}
                  </>
                ) : (
                  <>
                    <h3>Updates for this group</h3>
                    {inheritedGroups.map((owner) => {
                      const inherited = published.filter((c) => c.kind === "brief" && c.groups.includes(owner.id));
                      return inherited.length ? <p key={owner.id} className="text-copy text-muted-foreground">Inherited from {groupPath(owner.id, data.groups)}: {inherited.map((c) => c.title).join(" · ")}</p> : null;
                    })}
                    <BulkPicker
                      title="Add Updates"
                      description="Add Updates to this group’s For you list. Everyone can still explore published Updates."
                      options={published
                        .filter(
                          (c) =>
                            c.kind === "brief" && !c.groups.includes(group.id),
                        )
                        .map((c) => ({
                          id: c.id,
                          label: c.title,
                          description: c.category,
                        }))}
                      onApply={async (ids) => {
                        await learnMany(
                          ids.map((contentId) => ({
                            operation: "target",
                            contentId,
                            groupId: group.id,
                            expected:
                              data.content.find((c) => c.id === contentId)
                                ?.revision || 0,
                          })),
                        );
                      }}
                      actionLabel="Add Updates"
                    />
                    <CollectionControls
                      sortLabel={updateSort === "title" ? "Title A–Z" : updateSort === "created-newest" ? "Created newest first" : updateSort === "created-oldest" ? "Created oldest first" : updateSort === "updated-newest" ? "Updated newest first" : "Updated oldest first"}
                      sort={                      <FormField label="Sort updates for this group">
                      <SelectField
                        value={updateSort}
                        onValueChange={(v) =>
                          setUpdateSort(v as GroupBrowseSort)
                        }
                      >
                        <option value="updated-newest">
                          Updated newest first
                        </option>
                        <option value="updated-oldest">
                          Updated oldest first
                        </option>
                        <option value="created-newest">
                          Created newest first
                        </option>
                        <option value="created-oldest">
                          Created oldest first
                        </option>
                        <option value="title">Title A–Z</option>
                      </SelectField>
                      </FormField>} filters={query ? [{ id: "query", label: `Search: ${query}`, onRemove: () => setQuery("") }] : []} onClear={() => setQuery("")} search={
                      <FormField label="Find an update" visuallyHiddenLabel>
                        <Input
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Find an update"
                        />
                      </FormField>
                    }>

                    </CollectionControls>
                    <BulkActions
                      collectionSize={updateSelection.collectionSize}
                      selected={updateSelection.actionIds}
                      onSelectionChange={updateSelection.setSelected}
                      commands={[
                        {
                          id: "remove",
                          label: "Remove from group",
                          description:
                            "Remove direct audience links. Published Updates remain available to everyone allowed into the installation.",
                          apply: async () => {
                            await learnMany(
                              updateSelection.actionIds.map((contentId) => ({
                                operation: "untarget",
                                contentId,
                                groupId: group.id,
                                expected:
                                  data.content.find((c) => c.id === contentId)
                                    ?.revision || 0,
                              })),
                            );
                          },
                        },
                      ]}
                    />
                    <SelectableRows
                      label="Updates for this group"
                      empty={<CollectionEmpty count={groupUpdates.length} total={published.filter((c) => c.kind === "brief" && c.groups.includes(group.id)).length} noun="updates" onClear={() => setQuery("")} />}
                      scope={query + updateSort}
                      selected={updateSelection.selected}
                      onChange={updateSelection.setSelected}
                      rows={groupUpdates.map((c) => ({
                        id: c.id,
                        label: c.title,
                        detail: c.category,
                      }))}
                    />
                  </>
                )}
              </FieldGroup>
            </TabsContent>
          </Tabs>
        </>
      )}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) closeCreate(); }}>
        <DialogContent
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}
        >
          <DialogTitle>Create learning group</DialogTitle>
          <DialogDescription>Name the group and optionally place it beneath an existing group.</DialogDescription>
          <form className="grid gap-4" onSubmit={async (event) => {
            event.preventDefault();
            const clean = name.trim();
            if (!clean) return;
            if (data.groups.some((g) => g.name.toLowerCase() === clean.toLowerCase())) {
              setNotice("That group already exists.");
              return;
            }
            const id = crypto.randomUUID();
            if (await save({
              ...data,
              groups: [...data.groups, { id, name: clean, parentId: createParent || undefined, learningItems: [], teamIds: [] }],
            }, "Learning group created.")) {
              setCreateOpen(false);
              setName("");
              setCreateParent("");
              setSelected(id);
              destination.reveal();
            }
          }}>
            {notice && <Alert variant="destructive">{notice}</Alert>}
            <FieldGroup disabled={busy}>
              <FormField label="New learning group">
                <Input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Account executives" />
              </FormField>
              <FormField label="Parent group" description="Optional. Members of a child group also receive the parent group’s learning and Updates.">
                <SelectField value={createParent} onValueChange={setCreateParent} disabled={busy}>
                  <option value="">Top level</option>
                  {data.groups.map((candidate) => <option key={candidate.id} value={candidate.id}>{groupPath(candidate.id, data.groups)}</option>)}
                </SelectField>
              </FormField>
            </FieldGroup>
            <DialogFooter className="justify-end">
              <ActionGroup>
                <Button type="button" variant="outline" disabled={busy} onClick={closeCreate}>Cancel</Button>
                <Button type="submit" loading={busy}>Create group</Button>
              </ActionGroup>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
