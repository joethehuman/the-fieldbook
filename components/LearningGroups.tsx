"use client";
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
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

export function OrderedLearning({
  items,
  onReorder,
  onRemove,
  disabled = false,
}: {
  items: { id: string; label: string; detail?: ReactNode }[];
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  function move(id: string, position: number) {
    const ids = items.map((i) => i.id),
      from = ids.indexOf(id);
    if (
      from < 0 ||
      position < 0 ||
      position >= ids.length ||
      from === position ||
      disabled
    )
      return;
    ids.splice(from, 1);
    ids.splice(position, 0, id);
    onReorder(ids);
  }
  return (
    <ol className="learning-order">
      {items.map((item, index) => (
        <li
          key={item.id}
          onDragOver={(e) => {
            if (dragged) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragged) move(dragged, index);
            setDragged(null);
          }}
        >
          <button
            type="button"
            className="order-handle"
            draggable={!disabled}
            disabled={disabled}
            aria-label={`Reorder ${item.label}; use up or down arrow`}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", item.id);
              setDragged(item.id);
            }}
            onDragEnd={() => setDragged(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                move(item.id, index + (e.key === "ArrowUp" ? -1 : 1));
              }
            }}
          >
            <GripVertical size={17} />
          </button>
          <span className="order-position">{index + 1}</span>
          <div className="order-copy">
            <strong>{item.label}</strong>
            {item.detail && <small>{item.detail}</small>}
          </div>
          <div className="order-actions">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Move ${item.label} up`}
              disabled={disabled || index === 0}
              onClick={() => move(item.id, index - 1)}
            >
              <ArrowUp size={16} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Move ${item.label} down`}
              disabled={disabled || index === items.length - 1}
              onClick={() => move(item.id, index + 1)}
            >
              <ArrowDown size={16} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={`Remove ${item.label}`}
              onClick={() => onRemove(item.id)}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </li>
      ))}
    </ol>
  );
}
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
      setNotice(message);
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
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!group ? (
        <>
          <div className="section-heading">
            <div>
              <h2>Learning groups</h2>
              <p>
                Choose who courses and updates are for. Everyone can explore the
                full library.
              </p>
            </div>
          </div>
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
            <label>
              New learning group
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Account executives"
              />
            </label>
            <Button disabled={busy} type="submit">
              <Plus size={16} />
              Create group
            </Button>
          </form>
          <div className="group-grid">
            {data.groups.map((g) => (
              <section className="group-card" key={g.id}>
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
              </section>
            ))}
          </div>
        </>
      ) : (
        <>
          <button
            className="text-button"
            onClick={() => {
              setSelected("");
              setQuery("");
            }}
          >
            ← All learning groups
          </button>
          <div className="section-heading">
            <div>
              <h2>{group.name}</h2>
              <p>
                Members receive this group’s courses and updates in For you.
              </p>
            </div>
            <div className="button-group">
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
            </div>
          </div>
          <div className="topic-tabs" aria-label="Learning group sections">
            {["members", "learning", "updates"].map((t) => (
              <button
                key={t}
                aria-pressed={tab === t}
                onClick={() => {
                  setTab(t);
                  setQuery("");
                }}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <fieldset disabled={busy} className="learning-admin-fields">
            {tab === "members" ? (
              <>
                <label>
                  Parent learning group
                  <select
                    value={group.parentId || ""}
                    onChange={(e) =>
                      changeGroup({ parentId: e.target.value || undefined })
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
                  </select>
                </label>
                <p className="field-help">
                  Members also receive courses and updates from parent groups.
                </p>
                <h3>Teams</h3>
                <p className="field-help">
                  Team membership stays in sync. Each selected team includes its
                  direct members; select child teams separately.
                </p>
                <div className="group-picker-options">
                  {(data.teams || []).map((t) => (
                    <label className="group-picker-option" key={t.id}>
                      <input
                        type="checkbox"
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
                    </label>
                  ))}
                </div>
                {!data.teams?.length && (
                  <p>Create a team in Teams to link it here.</p>
                )}
                <h3>People</h3>
                <label>
                  Find a person
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name or email"
                  />
                </label>
                <div className="membership-list">
                  {data.users
                    .filter((u) => matches(u.name + " " + u.email))
                    .map((u) => {
                      const via = u.teamId && group.teamIds?.includes(u.teamId);
                      const effective = effectiveGroups(u, data.groups).has(
                        group.id,
                      );
                      return (
                        <label className="membership-person" key={u.id}>
                          <input
                            type="checkbox"
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
                        </label>
                      );
                    })}
                </div>
                <p className="field-help">
                  Check a person to add them individually. Unchecking does not
                  remove membership supplied by a team or child group.
                </p>
              </>
            ) : tab === "learning" ? (
              <>
                <h3>Recommended sequence</h3>
                <p className="field-help">
                  Add courses or reusable curricula. Reorder to recommend what
                  to take next. Every course stays available.
                </p>
                {group.parentId && (
                  <p className="notice">
                    Courses from parent groups come first. Manage those courses
                    in the parent group.
                  </p>
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
                  <p className="empty">
                    No assigned courses yet. Add a course or curriculum below.
                  </p>
                )}
                <label>
                  Search courses and curricula
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search the library"
                  />
                </label>
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
                            {i.kind === "curriculum" ? "Curriculum" : "Course"}{" "}
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
                <p className="field-help">
                  These updates appear in For you, newest first. Updates never
                  affect learning completion.
                </p>
                <label>
                  Find an update
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search updates"
                  />
                </label>
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
                              setNotice("Update audience saved.");
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
          </fieldset>
        </>
      )}
    </section>
  );
}
