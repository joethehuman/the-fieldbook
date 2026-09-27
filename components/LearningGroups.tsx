"use client";
import { BulkActions } from "./patterns/bulk-actions";
import { SelectableRows } from "./patterns/selectable-rows";
import { groupLearningCommands } from "./bulk-relationships";
import { SelectRows, useBulkSelection } from "./patterns/bulk-selection";
import { BulkPicker } from "./patterns/bulk-selection";
import { Note } from "@/components/ui/note";
import { FormField } from "@/components/patterns/form-field";
import { useToast } from "./ui/toast";
import { OrderedLearning } from "./patterns/ordered-learning";
import { SelectField } from "./ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Checkbox } from "@/components/ui/choice";
import { useRevealTarget } from "./patterns/use-reveal-target";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldDescription } from "@/components/ui/field";
import { SectionHeader, EmptyState } from "@/components/patterns/layout";
import { Alert } from "@/components/ui/alert";
import { ActionGroup } from "@/components/ui/action-group";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { Workspace } from "@/lib/store";
import {
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
import { useInteractionDialog } from "./ui/interaction-dialog";
import type { LearningHandler } from "./Assignments";
import { SaveRecoveryError } from "@/lib/save-recovery";

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
  const [selected, setSelected] = useState(initialGroup || "");
  const [tab, setTab] = useState("learning");
  const [query, setQuery] = useState("");
  const [updateSort, setUpdateSort] =
    useState<GroupBrowseSort>("updated-newest");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const teamSelection = useBulkSelection(selected + tab);
  const peopleSelection = useBulkSelection(selected + tab + query);
  const learningSelection = useBulkSelection(selected + tab);
  const updateSelection = useBulkSelection(selected + tab + query);
  const overviewSelection = useBulkSelection(selected);
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
  return (
    <section
      {...destination.targetProps}
      aria-label={group ? group.name : "Learning groups"}
      className="learning-admin"
    >
      {notice && <Alert variant="destructive">{notice}</Alert>}
      {!group ? (
        <>
          <SectionHeader
            title={<h2>Learning groups</h2>}
            description={
              <>
                Choose who courses and updates are for. Everyone can explore the
                full library.
              </>
            }
          ></SectionHeader>
          <form
            className="group-create"
            onSubmit={async (e) => {
              e.preventDefault();
              const clean = name.trim();
              if (!clean) return;
              if (
                data.groups.some(
                  (g) => g.name.toLowerCase() === clean.toLowerCase(),
                )
              ) {
                setNotice("That group already exists.");
                return;
              }
              const id = crypto.randomUUID();
              if (
                await save(
                  {
                    ...data,
                    groups: [
                      ...data.groups,
                      { id, name: clean, learningItems: [], teamIds: [] },
                    ],
                  },
                  "Learning group created.",
                )
              ) {
                setName("");
                setSelected(id);
                destination.reveal();
              }
            }}
          >
            <FormField label="New learning group">
              <Input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Account executives"
              />
            </FormField>
            <Button loading={busy} type="submit">
              <Plus size={16} />
              Create group
            </Button>
          </form>
          <BulkActions
            selected={overviewSelection.selected}
            onSelectionChange={overviewSelection.setSelected}
            noun="groups"
            commands={groupLearningCommands(
              data,
              overviewSelection.selected,
              onChange,
              learnMany,
            )}
          />
          <div className="flex items-center gap-3">
            <SelectRows
              label="Select all learning groups"
              ids={data.groups.map((g) => g.id)}
              value={overviewSelection.selected}
              onChange={overviewSelection.setSelected}
            />
            Select all learning groups
          </div>
          <div className="group-grid">
            {data.groups.map((g) => (
              <Card className="flex flex-col p-0 sm:p-0" key={g.id}>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      aria-label={`Select ${g.name}`}
                      checked={overviewSelection.selected.includes(g.id)}
                      onCheckedChange={(v) =>
                        overviewSelection.toggle(g.id, v === true)
                      }
                    />
                    <h3 className="font-semibold">{g.name}</h3>
                  </div>
                </CardContent>
                <CardFooter className="mt-auto">
                  <p className="text-copy text-muted-foreground">
                    {
                      data.users.filter(
                        (u) =>
                          u.active && effectiveGroups(u, data.groups).has(g.id),
                      ).length
                    }{" "}
                    people ·{" "}
                    {
                      expandLearning(groupItems(g, content), curricula).filter(
                        (id) => published.some((c) => c.id === id),
                      ).length
                    }{" "}
                    assigned courses
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelected(g.id);
                      destination.reveal();
                      setQuery("");
                      setNotice("");
                    }}
                  >
                    Manage {g.name}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          <Button
            variant="link"
            onClick={() => {
              setSelected("");
              destination.reveal();
              setQuery("");
            }}
          >
            ← All learning groups
          </Button>
          <SectionHeader
            title={<h2>{group.name}</h2>}
            description={
              <>Members receive this group’s courses and updates in For you.</>
            }
          >
            <ActionGroup>
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
                    <FormField
                      label="Parent learning group"
                      description="Members also receive courses and updates from parent groups."
                    >
                      <SelectField
                        disabled={busy}
                        value={group.parentId || ""}
                        onValueChange={(value) =>
                          changeGroup({ parentId: value || undefined })
                        }
                      >
                        <option value="">No parent</option>
                        {data.groups
                          .filter((g) => canParent(group.id, g.id, data.groups))
                          .map((g) => (
                            <option value={g.id} key={g.id}>
                              {g.name}
                            </option>
                          ))}
                      </SelectField>
                    </FormField>
                    <h3>Teams</h3>
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
                          .map((t) => ({ id: t.id, label: t.name }))}
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
                    <BulkActions
                      selected={teamSelection.selected}
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
                                  (id) => !teamSelection.selected.includes(id),
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
                      rows={(data.teams || [])
                        .filter((t) => group.teamIds?.includes(t.id))
                        .map((t) => ({ id: t.id, label: t.name }))}
                      selected={teamSelection.selected}
                      onChange={teamSelection.setSelected}
                    />
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
                    <FormField label="Find a member">
                      <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search name or email"
                      />
                    </FormField>
                    <BulkActions
                      selected={peopleSelection.selected}
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
                                  peopleSelection.selected.includes(u.id)
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
                      scope={query}
                      selected={peopleSelection.selected}
                      onChange={peopleSelection.setSelected}
                      rows={data.users
                        .filter(
                          (u) =>
                            effectiveGroups(u, data.groups).has(group.id) &&
                            matches(u.name + " " + u.email),
                        )
                        .map((u) => ({
                          id: u.id,
                          label: u.name,
                          detail: u.email,
                          disabledReason: !u.groups.includes(group.id)
                            ? "Included through a team or child group; manage that source to remove membership."
                            : undefined,
                        }))}
                    />
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
                        Courses from parent groups come first. Manage those
                        courses in the parent group.
                      </Note>
                    )}
                    <BulkActions
                      selected={learningSelection.selected}
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
                                    !learningSelection.selected.includes(
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
                            ? `Curriculum · ${curricula.find((c) => c.id === i.id)?.courseIds.length || 0} courses`
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
                    <FormField label="Find an update">
                      <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search Updates"
                      />
                    </FormField>
                    <FormField label="Sort updates for this group">
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
                    </FormField>
                    <BulkActions
                      selected={updateSelection.selected}
                      onSelectionChange={updateSelection.setSelected}
                      commands={[
                        {
                          id: "remove",
                          label: "Remove from group",
                          description:
                            "Remove direct audience links. Published Updates remain available to everyone allowed into the installation.",
                          apply: async () => {
                            await learnMany(
                              updateSelection.selected.map((contentId) => ({
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
                      scope={query}
                      selected={updateSelection.selected}
                      onChange={updateSelection.setSelected}
                      rows={sortGroupBrowseItems(
                        published
                          .filter(
                            (c) =>
                              c.kind === "brief" &&
                              c.groups.includes(group.id) &&
                              matches(c.title),
                          )
                          .map((c) => ({ ...c, name: c.title })),
                        updateSort,
                      ).map((c) => ({
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
    </section>
  );
}
