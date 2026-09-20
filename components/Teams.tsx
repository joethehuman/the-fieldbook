"use client";
import { useState } from "react";
import type { Workspace } from "@/lib/store";
import {
  ancestorIds,
  assignedCourses,
  assignmentInfo,
  canParent,
  isComplete,
  reportTeamIds,
  type Team,
  type User,
} from "@/lib/types";
export function TeamsAdmin({
  data,
  onChange,
}: {
  data: Workspace;
  onChange: (d: Workspace) => void | Promise<void>;
}) {
  const teams = data.teams || [];
  const [editing, setEditing] = useState<Team | null>(null),
    [notice, setNotice] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
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
    try {
      await onChange({
        ...data,
        teams: [
          ...teams.filter((t) => t.id !== editing.id),
          { ...editing, name },
        ],
      });
      setEditing(null);
      setNotice("Team saved.");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  return (
    <>
      <div className="admin-toolbar">
        <p>Teams organize reporting. Groups determine assignments.</p>
        <button
          className="primary"
          onClick={() => {
            setEditing({ id: crypto.randomUUID(), name: "" });
            setNotice("");
          }}
        >
          Add team
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {editing && (
        <form className="editor-block" onSubmit={save}>
          <div className="filter-bar">
            <label>
              Team name
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
              Parent team
              <select
                value={editing.parentId || ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    parentId: e.target.value || undefined,
                  })
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
              </select>
            </label>
            <label>
              Manager
              <select
                value={editing.managerId || ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    managerId: e.target.value || undefined,
                  })
                }
              >
                <option value="">No manager</option>
                {data.users
                  .filter(
                    (u) =>
                      u.active && (u.role === "manager" || u.role === "admin"),
                  )
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <p className="muted">
            Assigning a manager grants reporting access for this team and its
            subteams.
          </p>
          <div className="button-group">
            <button className="primary">Save team</button>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Parent</th>
              <th>Manager</th>
              <th>Direct members</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.name}</strong>
                </td>
                <td>{teams.find((p) => p.id === t.parentId)?.name || "—"}</td>
                <td>
                  {data.users.find((u) => u.id === t.managerId)?.name ||
                    "Unassigned"}
                </td>
                <td>
                  {
                    data.users.filter((u) => u.active && u.teamId === t.id)
                      .length
                  }
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => {
                      setEditing({ ...t });
                      setNotice("");
                    }}
                  >
                    Edit team
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!teams.length && (
        <div className="empty">
          Create your first team, then assign its members in Profiles.
        </div>
      )}
    </>
  );
}
export function TeamProgress({ data, user }: { data: Workspace; user: User }) {
  const teams = data.teams || [];
  const allowed = reportTeamIds(user, teams);
  const [teamId, setTeamId] = useState("all"),
    [query, setQuery] = useState(""),
    [person, setPerson] = useState("");
  const users = data.users.filter(
    (u) =>
      u.active &&
      (user.role === "admin" || (!!u.teamId && allowed.has(u.teamId))) &&
      (teamId === "all" ||
        (!!u.teamId && ancestorIds(u.teamId, teams).has(teamId))) &&
      `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  const rows = users.map((u) => {
    const assigned = assignedCourses(
      data.publishedContent || data.content,
      u,
      data.groups,
    );
    const completed = assigned.filter((c) =>
      isComplete(c, data.progress[u.id] || []),
    ).length;
    return { u, assigned, completed };
  });
  const total = rows.reduce((n, r) => n + r.assigned.length, 0),
    done = rows.reduce((n, r) => n + r.completed, 0);
  return (
    <>
      <div className="filter-bar">
        <label>
          Reporting team
          <select
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              setPerson("");
            }}
          >
            <option value="all">
              {user.role === "admin" ? "Entire organization" : "All my teams"}
            </option>
            {teams
              .filter((t) => allowed.has(t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Find a team member
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPerson("");
            }}
            placeholder="Name or email"
          />
        </label>
      </div>
      <p className="muted">
        Includes subteams. Currentness uses the latest published course
        versions.
      </p>
      <div className="report-summary">
        <strong>{users.length} people</strong>
        <span>
          {done} of {total} assignments complete
        </span>
        <span>
          {total
            ? Math.round((done / total) * 100) + "% current"
            : "No assignments"}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team member</th>
              <th>Team</th>
              <th>Assigned</th>
              <th>Completed</th>
              <th>Current</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ u, assigned, completed }) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                </td>
                <td>
                  {teams.find((t) => t.id === u.teamId)?.name || "No team"}
                </td>
                <td>{assigned.length}</td>
                <td>{completed}</td>
                <td>
                  {assigned.length
                    ? Math.round((completed / assigned.length) * 100) + "%"
                    : "—"}
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => setPerson(u.id)}
                  >
                    View courses
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!users.length && (
        <div className="empty">No team members match this view.</div>
      )}
      {rows
        .filter((r) => r.u.id === person)
        .map(({ u, assigned }) => (
          <section className="editor-block" key={u.id}>
            <h2>{u.name}’s assignments</h2>
            {assigned.map((c) => {
              const done = isComplete(c, data.progress[u.id] || []),
                due = assignmentInfo(c, u, data.groups).dueDate;
              return (
                <div className="report-course" key={c.id}>
                  <div>
                    <strong>{c.title}</strong>
                    <small>
                      {c.category} · v{c.version}
                      {due ? ` · Due ${due}` : ""}
                    </small>
                  </div>
                  <span>
                    {done
                      ? "Completed"
                      : due && due < new Date().toISOString().slice(0, 10)
                        ? "Overdue"
                        : "Outstanding"}
                  </span>
                </div>
              );
            })}
            {!assigned.length && <p>No assigned courses.</p>}
          </section>
        ))}
    </>
  );
}
