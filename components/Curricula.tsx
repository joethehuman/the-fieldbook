"use client";
import { useEffect, useState } from "react";
import type { Workspace } from "@/lib/store";
import type { Curriculum } from "@/lib/types";
import { groupItems } from "@/lib/learning-groups";
import { OrderedLearning } from "./LearningGroups";
import { Button } from "./ui/button";
import { useInteractionDialog } from "./ui/interaction-dialog";

export default function Curricula({
  data,
  onChange,
  onEditingChange,
}: {
  onEditingChange?: (editing: boolean) => void;
  data: Workspace;
  onChange: (data: Workspace) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState<Curriculum | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm } = useInteractionDialog();
  useEffect(() => {
    onEditingChange?.(!!editing);
  }, [!!editing, onEditingChange]);
  const all = data.curricula || [];
  const content = data.publishedContent || data.content;
  const linked = (id: string) =>
    data.groups.filter((g) =>
      groupItems(g, content).some(
        (i) => i.kind === "curriculum" && i.id === id,
      ),
    );
  async function save() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      setNotice("Give the curriculum a name.");
      return;
    }
    if (
      all.some(
        (c) =>
          c.id !== editing.id && c.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setNotice("That curriculum name already exists.");
      return;
    }
    if (editing.status === "published" && !editing.courseIds.length) {
      setNotice("Add at least one course before publishing.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await onChange({
        ...data,
        curricula: [
          ...all.filter((c) => c.id !== editing.id),
          { ...editing, name },
        ],
      });
      setEditing(null);
      setNotice("Curriculum saved.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(c: Curriculum) {
    if (
      !(await confirm(
        `Delete ${c.name}? It will be removed from ${linked(c.id).length} learning groups. Course content and completion history are preserved.`,
      ))
    )
      return;
    setBusy(true);
    try {
      await onChange({
        ...data,
        curricula: all.filter((x) => x.id !== c.id),
        groups: data.groups.map((g) => ({
          ...g,
          learningItems: groupItems(g, content).filter(
            (i) => i.kind !== "curriculum" || i.id !== c.id,
          ),
        })),
      });
      setNotice("Curriculum deleted. Learning history preserved.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="learning-admin">
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy} className="learning-admin-fields">
            <h2>
              {all.some((c) => c.id === editing.id)
                ? "Edit curriculum"
                : "New curriculum"}
            </h2>
            <p>A playlist of courses, in the order you recommend.</p>
            <label>
              Name
              <input
                required
                maxLength={80}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              Description
              <textarea
                maxLength={1000}
                rows={2}
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </label>
            <OrderedLearning
              items={editing.courseIds.map((id) => ({
                id,
                label:
                  content.find((c) => c.id === id)?.title ||
                  "Unavailable course",
                detail:
                  content.find((c) => c.id === id)?.status !== "published"
                    ? "Not currently published"
                    : undefined,
              }))}
              onReorder={(courseIds) => setEditing({ ...editing, courseIds })}
              onRemove={(id) =>
                setEditing({
                  ...editing,
                  courseIds: editing.courseIds.filter((x) => x !== id),
                })
              }
            />
            <label>
              Find a course
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the course library"
              />
            </label>
            <div className="learning-search-results">
              {content
                .filter(
                  (c) =>
                    c.kind === "course" &&
                    c.status === "published" &&
                    !editing.courseIds.includes(c.id) &&
                    (c.title + " " + c.category)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .map((c) => (
                  <div className="learning-search-result" key={c.id}>
                    <span>
                      <strong>{c.title}</strong>
                      <small>{c.category}</small>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={`Add ${c.title}`}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          courseIds: [...editing.courseIds, c.id],
                        })
                      }
                    >
                      Add
                    </Button>
                  </div>
                ))}
            </div>
            <label>
              Status
              <select
                value={editing.status}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    status: e.target.value as Curriculum["status"],
                  })
                }
              >
                <option value="draft" disabled={linked(editing.id).length > 0}>
                  Draft
                </option>
                <option value="published">Published</option>
              </select>
            </label>
            <p className="field-help">
              Published curricula are available in the library and can be added
              to learning groups.
            </p>
            {!!linked(editing.id).length && (
              <p className="notice">
                Saving updates {linked(editing.id).length} learning groups. New
                courses join their assigned learning lists; existing completions
                are preserved. Remove group links before returning this
                curriculum to draft.
              </p>
            )}
            <div className="button-group">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save curriculum"}
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={async () => {
                  if (await confirm("Discard unsaved curriculum changes?")) {
                    setEditing(null);
                    setNotice("");
                  }
                }}
              >
                Cancel
              </Button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <div className="section-heading">
            <div>
              <h2>Curricula</h2>
              <p>
                Create reusable playlists, then add them to learning groups.
              </p>
            </div>
            <Button
              onClick={() => {
                setEditing({
                  id: crypto.randomUUID(),
                  name: "",
                  description: "",
                  courseIds: [],
                  status: "draft",
                });
                setQuery("");
                setNotice("");
              }}
            >
              Create curriculum
            </Button>
          </div>
          <div className="group-grid">
            {all.map((c) => (
              <section className="group-card" key={c.id}>
                <span className="eyebrow">{c.status}</span>
                <h3>{c.name}</h3>
                <p>{c.description}</p>
                <p>
                  {c.courseIds.length} courses · {linked(c.id).length} learning
                  groups
                </p>
                <div className="button-group">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setEditing(structuredClone(c));
                      setQuery("");
                      setNotice("");
                    }}
                  >
                    Edit {c.name}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => remove(c)}
                  >
                    Delete
                  </Button>
                </div>
              </section>
            ))}
          </div>
          {!all.length && (
            <p className="empty">
              No curricula yet. Create a playlist for onboarding or an ongoing
              learning program.
            </p>
          )}
        </>
      )}
    </section>
  );
}
