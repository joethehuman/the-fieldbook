"use client";
import { useToast } from "./ui/toast";
import { OrderedLearning } from "./patterns/ordered-learning";
import { SelectField } from "./ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Checkbox } from "@/components/ui/choice";
import { Card } from "@/components/ui/card";
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
import { Button } from "./ui/button";
import { useInteractionDialog } from "./ui/interaction-dialog";
import type { LearningHandler } from "./Assignments";

const key = (i: LearningItem) => `${i.kind}:${i.id}`;
export default function LearningGroups({
  data,
  onChange,
  onLearning,
  initialGroup,
}: {
  data: Workspace;
  onChange: (d: Workspace) => void | Promise<void>;
  onLearning: LearningHandler;
  initialGroup?: string;
}) {
  const notify = useToast();
  const { confirm, prompt } = useInteractionDialog();
  const [selected, setSelected] = useState(initialGroup || "");
  const [tab, setTab] = useState("learning");
  const [query, setQuery] = useState("");
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
      await onChange(next);
      setNotice("");
      notify(message);
      return true;
    } catch (e) {
      setNotice((e as Error).message);
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
    if (ok) setSelected("");
  }
  const matches = (name: string) =>
    name.toLowerCase().includes(query.trim().toLowerCase());
  return (
    <section className="learning-admin">
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
              }
            }}
          >
            <Field>
              New learning group
              <Input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Account executives"
              />
            </Field>
            <Button disabled={busy} type="submit">
              <Plus size={16} />
              Create group
            </Button>
          </form>
          <div className="group-grid">
            {data.groups.map((g) => (
              <Card className="grid gap-4" key={g.id}>
                <h3>{g.name}</h3>
                <p>
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
                    setQuery("");
                    setNotice("");
                  }}
                >
                  Manage {g.name}
                </Button>
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
                    <Field>
                      Parent learning group
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
                    </Field>
                    <FieldDescription>
                      Members also receive courses and updates from parent
                      groups.
                    </FieldDescription>
                    <h3>Teams</h3>
                    <FieldDescription>
                      Team membership stays in sync. Each selected team includes
                      its direct members; select child teams separately.
                    </FieldDescription>
                    <div className="group-picker-options">
                      {(data.teams || []).map((t) => (
                        <Field
                          orientation="horizontal"
                          className="group-picker-option"
                          key={t.id}
                        >
                          <Checkbox
                            checked={group.teamIds?.includes(t.id) || false}
                            onChange={(e) =>
                              changeGroup({
                                teamIds: e.target.checked
                                  ? [...(group.teamIds || []), t.id]
                                  : (group.teamIds || []).filter(
                                      (id) => id !== t.id,
                                    ),
                              })
                            }
                          />
                          {t.name}
                        </Field>
                      ))}
                    </div>
                    {!data.teams?.length && (
                      <p>Create a team in Teams to link it here.</p>
                    )}
                    <h3>People</h3>
                    <Field>
                      Find a person
                      <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search name or email"
                      />
                    </Field>
                    <div className="membership-list">
                      {data.users
                        .filter((u) => matches(u.name + " " + u.email))
                        .map((u) => {
                          const via =
                            u.teamId && group.teamIds?.includes(u.teamId);
                          const effective = effectiveGroups(u, data.groups).has(
                            group.id,
                          );
                          return (
                            <Field
                              orientation="horizontal"
                              className="membership-person"
                              key={u.id}
                            >
                              <Checkbox
                                checked={u.groups.includes(group.id)}
                                onChange={(e) =>
                                  save({
                                    ...data,
                                    users: data.users.map((p) =>
                                      p.id === u.id
                                        ? {
                                            ...p,
                                            groups: e.target.checked
                                              ? [...p.groups, group.id]
                                              : p.groups.filter(
                                                  (id) => id !== group.id,
                                                ),
                                          }
                                        : p,
                                    ),
                                  })
                                }
                              />
                              <span>
                                <strong>{u.name}</strong>
                                <small>
                                  {u.email}
                                  {!u.active ? " · Inactive" : ""}
                                </small>
                              </span>
                              <small>
                                {via
                                  ? "Via team"
                                  : effective && !u.groups.includes(group.id)
                                    ? "Via child group"
                                    : ""}
                                {u.groups.includes(group.id)
                                  ? " · Individually added"
                                  : ""}
                              </small>
                            </Field>
                          );
                        })}
                    </div>
                    <FieldDescription>
                      Check a person to add them individually. Unchecking does
                      not remove membership supplied by a team or child group.
                    </FieldDescription>
                  </>
                ) : tab === "learning" ? (
                  <>
                    <h3>Recommended sequence</h3>
                    <FieldDescription>
                      Add courses or reusable curricula. Reorder to recommend
                      what to take next. Every course stays available.
                    </FieldDescription>
                    {group.parentId && (
                      <Alert>
                        Courses from parent groups come first. Manage those
                        courses in the parent group.
                      </Alert>
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
                    <Field>
                      Search courses and curricula
                      <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search the library"
                      />
                    </Field>
                    <div className="learning-search-results">
                      {[
                        ...published
                          .filter((c) => c.kind === "course")
                          .map((c) => ({
                            kind: "course" as const,
                            id: c.id,
                            name: c.title,
                            detail: c.category,
                          })),
                        ...curricula
                          .filter((c) => c.status === "published")
                          .map((c) => ({
                            kind: "curriculum" as const,
                            id: c.id,
                            name: c.name,
                            detail: `${c.courseIds.length} courses`,
                          })),
                      ]
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
                    <FieldDescription>
                      These updates appear in For you, newest first. Updates
                      never affect learning completion.
                    </FieldDescription>
                    <Field>
                      Find an update
                      <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search updates"
                      />
                    </Field>
                    <div className="learning-search-results">
                      {published
                        .filter((c) => c.kind === "brief" && matches(c.title))
                        .sort(
                          (a, b) =>
                            Number(b.groups.includes(group.id)) -
                              Number(a.groups.includes(group.id)) ||
                            b.updatedAt.localeCompare(a.updatedAt),
                        )
                        .map((c) => (
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
