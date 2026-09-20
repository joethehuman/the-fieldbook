"use client";
import { useEffect, useRef, useState } from "react";
import type { Workspace } from "@/lib/store";
import {
  ancestorIds,
  assignmentInfo,
  effectiveGroups,
  isComplete,
  type Assignment,
  type Content,
} from "@/lib/types";
import {
  assignmentKey,
  assignmentRules,
  deadlineLabel,
  type LearningAction,
} from "@/lib/learning";
export type LearningHandler = (action: LearningAction) => Promise<void>;
type Scope = { groupId?: string; userId?: string; courseId?: string };
export function Assignments({
  data,
  scope = {},
  onAction,
  onOpenGroup,
}: {
  data: Workspace;
  scope?: Scope;
  onAction: LearningHandler;
  onOpenGroup?: (id: string) => void;
}) {
  const [sourceGroup, setSourceGroup] = useState<string | null>(null);
  if (sourceGroup) scope = { groupId: sourceGroup };
  const openGroup =
    onOpenGroup ||
    ((id: string) => {
      setSourceGroup(id);
      setDetail(null);
    });
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [deadline, setDeadline] = useState("all");
  const [form, setForm] = useState<{
    editing: boolean;
    contentId: string;
    target: string;
    due: Assignment["due"];
  } | null>(null);
  const [detail, setDetail] = useState<{
    courseId: string;
    key: string;
  } | null>(null);
  const [pending, setPending] = useState<LearningAction | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  function confirmAction(action: LearningAction) {
    setMessage("");
    setPending(action);
  }
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogOpen = !!form || !!pending;
  useEffect(() => {
    if (!dialogOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    const focusable = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const list = focusable();
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    root?.addEventListener("keydown", key);
    return () => {
      root?.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [dialogOpen]);
  const courses = (data.publishedContent ?? data.content).filter(
    (c) => c.kind === "course" && c.status === "published",
  );
  const versioned = (c: Content) =>
    data.content.find((d) => d.id === c.id)?.revision || c.revision || 1;
  const person = data.users.find((u) => u.id === scope.userId);
  const group = data.groups.find((g) => g.id === scope.groupId);
  const relevant = (a: Assignment) =>
    scope.userId
      ? a.userId === scope.userId ||
        (!!a.groupId &&
          !!person &&
          effectiveGroups(person, data.groups).has(a.groupId))
      : scope.groupId
        ? !!a.groupId && ancestorIds(scope.groupId, data.groups).has(a.groupId)
        : true;
  const recipients = (a: Assignment) =>
    data.users.filter(
      (u) =>
        (a.userId === u.id ||
          (!!a.groupId && effectiveGroups(u, data.groups).has(a.groupId))) &&
        (!scope.groupId || effectiveGroups(u, data.groups).has(scope.groupId)),
    );
  const targetName = (a: Assignment) =>
    a.groupId
      ? data.groups.find((g) => g.id === a.groupId)?.name || "Unknown group"
      : data.users.find((u) => u.id === a.userId)?.name || "Unknown person";
  const inherited = (a: Assignment) =>
    !!a.groupId &&
    (!!scope.userId || (!!scope.groupId && a.groupId !== scope.groupId));
  const rows = courses
    .filter((c) => !scope.courseId || c.id === scope.courseId)
    .flatMap((c) =>
      assignmentRules(c)
        .filter(relevant)
        .map((a) => ({ c, a })),
    );
  const shown = rows.filter(
    ({ c, a }) =>
      `${c.title} ${targetName(a)}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" || assignmentKey(a) === filter) &&
      (deadline === "all" || a.due.type === deadline),
  );
  const active = detail
    ? rows.find(
        (r) => r.c.id === detail.courseId && assignmentKey(r.a) === detail.key,
      )
    : undefined;
  async function act(a: LearningAction) {
    setBusy(true);
    setMessage("");
    try {
      await onAction(a);
      setForm(null);
      setPending(null);
      setMessage(
        a.operation === "reset"
          ? "Progress reset."
          : a.operation === "complete"
            ? "Course marked complete."
            : a.operation === "unassign"
              ? "Assignment removed. Learning history was preserved."
              : "Assignment saved.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function openForm(c?: Content, a?: Assignment) {
    setMessage("");
    setForm({
      editing: !!a,
      contentId: c?.id || scope.courseId || courses[0]?.id || "",
      target: a
        ? assignmentKey(a)
        : scope.userId
          ? `user:${scope.userId}`
          : scope.groupId
            ? `group:${scope.groupId}`
            : "",
      due: a?.due || { type: "none" },
    });
  }
  const progressRows = (c: Content, people: typeof data.users) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Person</th>
            <th>Deadline</th>
            <th>Progress</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {people.map((u) => {
            const p = data.progress[u.id]?.find(
              (p) => p.content_id === c.id && p.version === c.version,
            );
            const complete = isComplete(c, data.progress[u.id] || []);
            return (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <small>
                    {u.email}
                    {!u.active ? " · Inactive" : ""}
                  </small>
                </td>
                <td>
                  {assignmentInfo(c, u, data.groups).dueDate || "No deadline"}
                </td>
                <td>
                  {complete
                    ? "Complete"
                    : p?.lessons.length
                      ? `${p.lessons.length} of ${c.lessons.length} lessons`
                      : "Not started"}
                </td>
                <td>
                  <div className="assignment-actions">
                    <button
                      disabled={busy || complete}
                      onClick={() =>
                        confirmAction({
                          operation: "complete",
                          contentId: c.id,
                          expected: versioned(c),
                          userId: u.id,
                          version: c.version,
                          progressExpected: p?.revision || 0,
                        })
                      }
                    >
                      Mark complete
                    </button>
                    <button
                      disabled={busy || !p}
                      onClick={() =>
                        confirmAction({
                          operation: "reset",
                          contentId: c.id,
                          expected: versioned(c),
                          userId: u.id,
                          version: c.version,
                          progressExpected: p?.revision || 0,
                        })
                      }
                    >
                      Reset progress
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!people.length && (
        <p className="muted">
          No people in this assignment yet. Future group members will inherit
          it.
        </p>
      )}
    </div>
  );
  return (
    <section className="assignments-panel">
      {sourceGroup && (
        <button
          onClick={() => {
            setSourceGroup(null);
            setDetail(null);
          }}
        >
          Back to course assignments
        </button>
      )}
      <div className="assignment-heading">
        <div>
          <h2>
            {person
              ? `${person.name} · Assignments`
              : group
                ? `${group.name} · Assignments`
                : "Assignments"}
          </h2>
          <p className="muted">
            Assign learning, set deadlines, and manage completion. Published
            courses remain available to everyone.
          </p>
        </div>
        <button
          className="primary"
          disabled={!courses.length || busy}
          onClick={() => openForm()}
        >
          Assign course
        </button>
      </div>
      {message && (
        <div role="status" className="success">
          {message}
        </div>
      )}
      <div className="assignment-filters">
        <label>
          Search assignments
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Course or recipient"
          />
        </label>
        {!scope.userId && !scope.groupId && (
          <label>
            Assigned to
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All groups and people</option>
              <optgroup label="Groups">
                {data.groups.map((g) => (
                  <option key={g.id} value={`group:${g.id}`}>
                    {g.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="People">
                {data.users.map((u) => (
                  <option key={u.id} value={`user:${u.id}`}>
                    {u.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        )}
        <label>
          Deadline
          <select
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          >
            <option value="all">All deadlines</option>
            <option value="none">No deadline</option>
            <option value="date">Specific date</option>
            <option value="days">Days after assignment</option>
          </select>
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Course</th>
              <th>Assigned through</th>
              <th>Deadline</th>
              <th>Completion</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ c, a }) => {
              const people = scope.userId && person ? [person] : recipients(a);
              return (
                <tr key={c.id + assignmentKey(a)}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() =>
                        setDetail({ courseId: c.id, key: assignmentKey(a) })
                      }
                    >
                      {c.title}
                    </button>
                  </td>
                  <td>
                    {targetName(a)}
                    <small>
                      {a.userId
                        ? "Direct assignment"
                        : inherited(a)
                          ? "Inherited from group"
                          : "Group and descendants"}
                    </small>
                  </td>
                  <td>{deadlineLabel(a.due)}</td>
                  <td>
                    {
                      people.filter((u) =>
                        isComplete(c, data.progress[u.id] || []),
                      ).length
                    }{" "}
                    of {people.length} complete
                  </td>
                  <td>
                    <div className="assignment-actions">
                      <button
                        onClick={() =>
                          setDetail({ courseId: c.id, key: assignmentKey(a) })
                        }
                      >
                        View
                      </button>
                      {inherited(a) ? (
                        <button onClick={() => openGroup(a.groupId!)}>
                          Manage source group
                        </button>
                      ) : (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => openForm(c, a)}
                          >
                            Edit deadline
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              confirmAction({
                                operation: "unassign",
                                contentId: c.id,
                                expected: versioned(c),
                                groupId: a.groupId,
                                userId: a.userId,
                              })
                            }
                          >
                            Unassign
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && (
          <p className="empty">
            No assignments match. Assign a published course to get started.
          </p>
        )}
      </div>
      {person && (
        <>
          <h3>Learning progress</h3>
          <p className="muted">
            Includes assigned courses and voluntary learning. Completion
            controls apply to the current published version.
          </p>
          {courses
            .filter(
              (c) =>
                assignmentRules(c).some(relevant) ||
                (data.progress[person.id] || []).some(
                  (p) => p.content_id === c.id && p.version === c.version,
                ),
            )
            .map((c) => (
              <section key={c.id}>
                <h4>{c.title}</h4>
                {progressRows(c, [person])}
              </section>
            ))}
        </>
      )}
      {active && (
        <section className="assignment-detail">
          <div className="assignment-heading">
            <div>
              <h3>{active.c.title}</h3>
              <p>
                {targetName(active.a)} · {deadlineLabel(active.a.due)}
              </p>
            </div>
            <button onClick={() => setDetail(null)}>Close details</button>
          </div>
          {progressRows(
            active.c,
            scope.userId && person ? [person] : recipients(active.a),
          )}
        </section>
      )}
      {form && (
        <div className="modal-backdrop" ref={dialogRef}>
          <form
            className="modal assignment-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Assign course"
            onSubmit={(e) => {
              e.preventDefault();
              const c = courses.find((c) => c.id === form.contentId);
              if (!c) return;
              const [kind, ...ids] = form.target.split(":");
              act({
                operation: "assign",
                contentId: c.id,
                expected: versioned(c),
                ...(kind === "group"
                  ? { groupId: ids.join(":") }
                  : { userId: ids.join(":") }),
                due: form.due,
              });
            }}
          >
            <h2>Assign course</h2>
            <label>
              Course
              <select
                required
                disabled={form.editing}
                value={form.contentId}
                onChange={(e) =>
                  setForm({ ...form, contentId: e.target.value })
                }
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assign to
              <select
                required
                disabled={form.editing}
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
              >
                <option value="">Choose a group or person</option>
                <optgroup label="Groups">
                  {data.groups.map((g) => (
                    <option key={g.id} value={`group:${g.id}`}>
                      {g.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="People">
                  {data.users
                    .filter((u) => u.active)
                    .map((u) => (
                      <option key={u.id} value={`user:${u.id}`}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>
            <label>
              Deadline
              <select
                value={form.due.type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    due:
                      e.target.value === "date"
                        ? {
                            type: "date",
                            date: new Date().toISOString().slice(0, 10),
                          }
                        : e.target.value === "days"
                          ? { type: "days", days: 7 }
                          : { type: "none" },
                  })
                }
              >
                <option value="none">No deadline</option>
                <option value="date">Specific date</option>
                <option value="days">Days after assignment</option>
              </select>
            </label>
            {form.due.type === "date" && (
              <label>
                Due date
                <input
                  type="date"
                  required
                  value={form.due.date}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      due: { type: "date", date: e.target.value },
                    })
                  }
                />
              </label>
            )}
            {form.due.type === "days" && (
              <label>
                Days after assignment
                <input
                  type="number"
                  required
                  min={1}
                  max={3650}
                  value={form.due.days}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      due: { type: "days", days: Number(e.target.value) },
                    })
                  }
                />
              </label>
            )}
            <p className="muted">
              Group assignments include descendants and future members. If a
              person has overlapping assignments, the earliest deadline applies.
            </p>
            {message && <p role="alert">{message}</p>}
            <div className="assignment-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save assignment"}
              </button>
            </div>
          </form>
        </div>
      )}
      {pending && (
        <div className="modal-backdrop" ref={dialogRef}>
          <section
            className="modal assignment-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm learning change"
          >
            <h2>
              {pending.operation === "reset"
                ? "Reset progress?"
                : pending.operation === "complete"
                  ? "Mark course complete?"
                  : "Remove assignment?"}
            </h2>
            <p>
              <strong>
                {courses.find((c) => c.id === pending.contentId)?.title}
              </strong>{" "}
              ·{" "}
              {pending.userId
                ? data.users.find((u) => u.id === pending.userId)?.name
                : data.groups.find((g) => g.id === pending.groupId)?.name}
            </p>
            <p>
              {pending.operation === "reset"
                ? "This clears lessons, completion, and quiz attempts for this person’s current course version. An audit record preserves the prior state."
                : pending.operation === "complete"
                  ? "This records an administrator completion for this person without requiring a quiz attempt."
                  : "This removes only this assignment source. Other direct or group assignments still apply. Learning history is preserved."}
            </p>
            {message && <p role="alert">{message}</p>}
            <div className="assignment-actions">
              <button disabled={busy} onClick={() => setPending(null)}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => act(pending)}
              >
                {busy ? "Saving…" : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
