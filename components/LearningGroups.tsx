"use client";
import { BulkPicker } from "./patterns/bulk-selection";
import { Note } from "@/components/ui/note";
import { FormField } from "@/components/patterns/form-field";
import { BrowseToolbar } from "@/components/patterns/layout";
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
  const [learningSort, setLearningSort] = useState<GroupBrowseSort>("title");
  const [updateSort, setUpdateSort] =
    useState<GroupBrowseSort>("assigned-first");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
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
          <div className="group-grid">
            {data.groups.map((g) => (
              <Card className="flex flex-col p-0 sm:p-0" key={g.id}>
                <CardContent>
                  <h3 className="font-semibold">{g.name}</h3>
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
                            !(await changeGroup({
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
                      <BulkPicker
                        title="Remove teams"
                        description="Remove these direct team links. Individual and inherited memberships remain; saved learning history is preserved."
                        options={(data.teams || [])
                          .filter((t) => group.teamIds?.includes(t.id))
                          .map((t) => ({ id: t.id, label: t.name }))}
                        onApply={async (ids) => {
                          if (
                            !(await changeGroup({
                              teamIds: group.teamIds?.filter(
                                (id) => !ids.includes(id),
                              ),
                            }))
                          )
                            throw new Error(
                              "Could not save. Review the group before retrying.",
                            );
                        }}
                        actionLabel="Remove teams"
                      />
                    </ActionGroup>
                    <p>
                      {(data.teams || [])
                        .filter((t) => group.teamIds?.includes(t.id))
                        .map((t) => t.name)
                        .join(", ") || "No directly linked teams."}
                    </p>
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
                            !(await save({
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
                      <BulkPicker
                        title="Remove people"
                        description="Remove individual memberships. Membership supplied by a team or child group remains. Saved learning history is preserved."
                        options={data.users
                          .filter((u) => u.groups.includes(group.id))
                          .map((u) => ({
                            id: u.id,
                            label: u.name,
                            description: u.email,
                          }))}
                        onApply={async (ids) => {
                          if (
                            !(await save({
                              ...data,
                              users: data.users.map((u) =>
                                ids.includes(u.id)
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
                            throw new Error(
                              "Could not save. Review the group before retrying.",
                            );
                        }}
                        actionLabel="Remove people"
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
                    <div className="membership-list">
                      {data.users
                        .filter(
                          (u) =>
                            effectiveGroups(u, data.groups).has(group.id) &&
                            matches(u.name + " " + u.email),
                        )
                        .map((u) => (
                          <div className="membership-person" key={u.id}>
                            <span>
                              <strong>{u.name}</strong>
                              <small>
                                {u.email}
                                {!u.active ? " · Inactive" : ""}
                              </small>
                            </span>
                            <small>
                              {[
                                u.groups.includes(group.id)
                                  ? "Individually added"
                                  : "",
                                u.teamId && group.teamIds?.includes(u.teamId)
                                  ? "Via team"
                                  : "",
                                !u.groups.includes(group.id) &&
                                !(u.teamId && group.teamIds?.includes(u.teamId))
                                  ? "Via child group"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                          </div>
                        ))}
                    </div>
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
                            !(await changeGroup({
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
                      <BulkPicker
                        title="Remove learning items"
                        description="Remove these direct assignments. Inherited assignments and saved progress remain."
                        options={items.map((i) => ({
                          id: key(i),
                          label:
                            i.kind === "course"
                              ? content.find((c) => c.id === i.id)?.title ||
                                "Unavailable course"
                              : curricula.find((c) => c.id === i.id)?.name ||
                                "Unavailable curriculum",
                        }))}
                        onApply={async (ids) => {
                          if (
                            !(await changeGroup({
                              learningItems: items.filter(
                                (i) => !ids.includes(key(i)),
                              ),
                            }))
                          )
                            throw new Error("Could not save the sequence.");
                        }}
                        actionLabel="Remove items"
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
                    <OrderedLearning
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
                        below.
                      </EmptyState>
                    )}
                    <BrowseToolbar>
                      <FormField label="Search courses and curricula">
                        <Input
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search the library"
                        />
                      </FormField>
                      <FormField label="Sort results">
                        <SelectField
                          aria-label="Sort courses and curricula"
                          value={learningSort}
                          onValueChange={(value) =>
                            setLearningSort(value as GroupBrowseSort)
                          }
                        >
                          <option value="title">Title A–Z</option>
                          <option value="updated-newest">
                            Recently updated
                          </option>
                          <option value="updated-oldest">
                            Oldest update first
                          </option>
                          <option value="created-newest">
                            Recently created
                          </option>
                          <option value="created-oldest">
                            Oldest creation first
                          </option>
                        </SelectField>
                      </FormField>
                    </BrowseToolbar>
                    <div className="learning-search-results">
                      {sortGroupBrowseItems(
                        [
                          ...published
                            .filter((c) => c.kind === "course")
                            .map((c) => ({
                              kind: "course" as const,
                              id: c.id,
                              name: c.title,
                              detail: c.category,
                              createdAt: c.createdAt,
                              updatedAt: c.updatedAt,
                            })),
                          ...curricula
                            .filter((c) => c.status === "published")
                            .map((c) => ({
                              kind: "curriculum" as const,
                              id: c.id,
                              name: c.name,
                              detail: `${c.courseIds.length} courses`,
                            })),
                        ],
                        learningSort,
                      )
                        .filter(
                          (i) =>
                            matches(i.name + " " + i.detail) &&
                            !items.some((x) => key(x) === key(i)),
                        )
                        .map((i) => (
                          <div className="learning-search-result" key={key(i)}>
                            <span>
                              <strong>{i.name}</strong>
                              <small>
                                {i.kind === "curriculum"
                                  ? "Curriculum"
                                  : "Course"}{" "}
                                · {i.detail}
                              </small>
                            </span>
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                changeGroup({
                                  learningItems: [
                                    ...items,
                                    { kind: i.kind, id: i.id },
                                  ],
                                })
                              }
                              aria-label={`Add ${i.name}`}
                            >
                              Add
                            </Button>
                          </div>
                        ))}
                    </div>
                  </>
                ) : (
                  <>
                    <h3>Updates for this group</h3>
                    <ActionGroup>
                      {([true, false] as const).map((add) => (
                        <BulkPicker
                          key={String(add)}
                          title={add ? "Add updates" : "Remove updates"}
                          description="Change this group’s For you updates. Everyone can still explore published updates."
                          options={published
                            .filter(
                              (c) =>
                                c.kind === "brief" &&
                                c.groups.includes(group.id) !== add,
                            )
                            .map((c) => ({ id: c.id, label: c.title }))}
                          onApply={async (ids) => {
                            await (
                              onLearningMany ||
                              (async (actions) => {
                                for (const action of actions)
                                  await onLearning(action);
                              })
                            )(
                              ids.map((contentId) => ({
                                operation: add
                                  ? ("target" as const)
                                  : ("untarget" as const),
                                contentId,
                                groupId: group.id,
                                expected:
                                  data.content.find((c) => c.id === contentId)
                                    ?.revision || 0,
                              })),
                            );
                          }}
                          actionLabel={add ? "Add updates" : "Remove updates"}
                        />
                      ))}
                    </ActionGroup>
                    <FieldDescription>
                      These updates appear in For you, newest first. Updates
                      never affect learning completion.
                    </FieldDescription>
                    <BrowseToolbar>
                      <FormField label="Find an update">
                        <Input
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search updates"
                        />
                      </FormField>
                      <FormField label="Sort results">
                        <SelectField
                          aria-label="Sort updates for this group"
                          value={updateSort}
                          onValueChange={(value) =>
                            setUpdateSort(value as GroupBrowseSort)
                          }
                        >
                          <option value="assigned-first">
                            For this group first
                          </option>
                          <option value="updated-newest">
                            Recently updated
                          </option>
                          <option value="updated-oldest">
                            Oldest update first
                          </option>
                          <option value="created-newest">
                            Recently created
                          </option>
                          <option value="created-oldest">
                            Oldest creation first
                          </option>
                          <option value="title">Title A–Z</option>
                        </SelectField>
                      </FormField>
                    </BrowseToolbar>
                    <div className="learning-search-results">
                      {sortGroupBrowseItems(
                        published
                          .filter((c) => c.kind === "brief" && matches(c.title))
                          .map((c) => ({
                            ...c,
                            name: c.title,
                            assigned: c.groups.includes(group.id),
                          })),
                        updateSort,
                      ).map((c) => (
                        <div className="learning-search-result" key={c.id}>
                          <span>
                            <strong>{c.title}</strong>
                            <small>
                              {c.groups.includes(group.id)
                                ? "For this group"
                                : "Available to everyone"}
                            </small>
                          </span>
                          <Button
                            variant="outline"
                            onClick={async () => {
                              setBusy(true);
                              setNotice("");
                              try {
                                await onLearning({
                                  operation: c.groups.includes(group.id)
                                    ? "untarget"
                                    : "target",
                                  contentId: c.id,
                                  groupId: group.id,
                                  expected:
                                    data.content.find((x) => x.id === c.id)
                                      ?.revision ||
                                    c.revision ||
                                    1,
                                });
                                setNotice("");
                                notify("Update audience saved.");
                              } catch (e) {
                                setNotice((e as Error).message);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {c.groups.includes(group.id) ? "Remove" : "Add"}
                          </Button>
                        </div>
                      ))}
                    </div>
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
