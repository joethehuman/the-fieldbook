"use client";
import { Assignments, type LearningHandler } from "./Assignments";
import { assignmentRules, assignmentKey } from "@/lib/learning";
import { PendingPeople } from "./PendingPeople";
import { useState } from "react";
import {
  Plus,
  X,
  Save,
  FileText,
  Users,
  Layers,
  BarChart3,
  Trash2,
  ArrowLeft,
  Check,
} from "lucide-react";
import MarkdownEditor, { type UploadMedia } from "./MarkdownEditor";
import SiteSettingsPanel from "./SiteSettingsPanel";
import { FeedbackAdmin } from "./Feedback";
import { TeamsAdmin, TeamProgress } from "./Teams";
import { canParent, type Assignment } from "@/lib/types";
import { videoSource } from "@/lib/video";
import type { Workspace } from "@/lib/store";
import {
  assignedCourses,
  isComplete,
  type Content,
  type User,
} from "@/lib/types";
type Props = {
  data: Workspace;
  user: User;
  onChange: (d: Workspace) => void | Promise<void>;
  production?: boolean;
  onLearning?: LearningHandler;
  onUpload?: UploadMedia;
};
const id = () => crypto.randomUUID();
export default function Admin({
  data,
  user,
  onChange,
  production = false,
  onUpload,
  onLearning,
}: Props) {
  const [tab, setTab] = useState("content"),
    [editing, setEditing] = useState<Content | null>(null),
    [person, setPerson] = useState<User | null>(null),
    [groupName, setGroupName] = useState(""),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [sort, setSort] = useState("title"),
    [peopleRole, setPeopleRole] = useState("all"),
    [peopleGroup, setPeopleGroup] = useState("all"),
    [peopleStatus, setPeopleStatus] = useState("all"),
    [groupParent, setGroupParent] = useState(""),
    [detailScope, setDetailScope] = useState<{
      groupId?: string;
      userId?: string;
    } | null>(null);
  const manageLearning: LearningHandler = async (action) => {
    if (onLearning) return onLearning(action);
    const next = structuredClone(data);
    const c = next.content.find((c) => c.id === action.contentId)!;
    if (action.operation === "assign" || action.operation === "unassign") {
      c.assignments = assignmentRules(c).filter(
        (a) => assignmentKey(a) !== assignmentKey(action),
      );
      if (action.operation === "assign")
        c.assignments.push({
          groupId: action.groupId,
          userId: action.userId,
          assignedAt: new Date().toISOString(),
          due: action.due!,
        });
      c.groups = c.assignments.flatMap((a) => (a.groupId ? [a.groupId] : []));
    } else {
      const list = next.progress[action.userId!] || [];
      next.progress[action.userId!] = [
        ...list.filter((p) => p.content_id !== c.id || p.version !== c.version),
        {
          content_id: c.id,
          version: c.version,
          lessons:
            action.operation === "complete" ? c.lessons.map((l) => l.id) : [],
          passed: action.operation === "complete",
          attempts: [],
          revision: (action.progressExpected || 0) + 1,
        },
      ];
    }
    await onChange(next);
  };
  function create(kind: Content["kind"]) {
    setEditing({
      id: id(),
      kind,
      title: "",
      summary: "",
      body: "",
      category: kind === "course" ? "New topic" : "General",
      folder: "",
      status: "draft",
      version: 1,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      assignments: [],
      duration: 5,
      groups: [],
      lessons:
        kind === "course" ? [{ id: id(), title: "Lesson 1", body: "" }] : [],
      questions: [],
    });
  }
  async function save(c: Content) {
    const old = data.content.find((x) => x.id === c.id);
    const updated = {
      ...c,
      createdAt:
        old?.createdAt ||
        old?.updatedAt ||
        c.createdAt ||
        new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await onChange({
      ...data,
      content: old
        ? data.content.map((x) => (x.id === c.id ? updated : x))
        : [...data.content, updated],
    });
    setEditing(null);
    setNotice(production ? "Content saved." : "Content saved in this browser.");
  }
  async function savePerson(e: React.FormEvent) {
    e.preventDefault();
    if (!person) return;
    if (
      data.users.some(
        (u) =>
          u.id !== person.id &&
          u.email.toLowerCase() === person.email.toLowerCase(),
      )
    ) {
      setNotice("A profile already uses that email.");
      return;
    }
    const previous = data.users.find((u) => u.id === person.id);
    const savedPerson = {
      ...person,
      groupJoinedAt: Object.fromEntries(
        person.groups.map((g) => [
          g,
          previous?.groups.includes(g)
            ? previous.groupJoinedAt?.[g] || "1970-01-01T00:00:00.000Z"
            : new Date().toISOString(),
        ]),
      ),
    };
    try {
      await onChange({
        ...data,
        users: data.users.some((u) => u.id === person.id)
          ? data.users.map((u) => (u.id === person.id ? savedPerson : u))
          : [...data.users, savedPerson],
      });
      setPerson(null);
      setNotice(production ? "Account saved." : "Demo profile saved.");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  if (editing)
    return (
      <Editor
        key={editing.id}
        content={editing}
        data={data}
        onSave={save}
        onCancel={() => setEditing(null)}
        onUpload={onUpload}
        production={production}
        onLearning={manageLearning}
      />
    );
  if (detailScope) {
    const group = data.groups.find((g) => g.id === detailScope.groupId);
    const person = data.users.find((u) => u.id === detailScope.userId);
    return (
      <>
        <button className="text-button" onClick={() => setDetailScope(null)}>
          <ArrowLeft size={16} />
          Back to {group ? "groups" : "people"}
        </button>
        <div className="page-heading">
          <h1>{group?.name || person?.name}</h1>
          <p>
            {group
              ? "Manage this group’s members and learning assignments."
              : person?.email}
          </p>
        </div>
        <Assignments
          key={JSON.stringify(detailScope)}
          data={data}
          scope={detailScope}
          onAction={manageLearning}
          onOpenGroup={(groupId) => setDetailScope({ groupId })}
        />
        {group && (
          <section>
            <h2>Direct members</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Role</th>
                    <th>Learning</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users
                    .filter((u) => u.groups.includes(group.id))
                    .map((u) => (
                      <tr key={u.id}>
                        <td>
                          {u.name}
                          <small>{u.email}</small>
                        </td>
                        <td>{u.role}</td>
                        <td>
                          <button
                            onClick={() => setDetailScope({ userId: u.id })}
                          >
                            View assignments
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Manage group membership from People → Edit. Assignments also apply
              to members of descendant groups.
            </p>
          </section>
        )}
      </>
    );
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">MAKE IT YOUR TEAM’S</span>
        <h1>A little order. A lot of clarity.</h1>
        <p>Keep your content fresh and your team moving forward.</p>
      </div>
      <div className="admin-tabs">
        {[
          { id: "content", name: "Content", icon: FileText },
          {
            id: "people",
            name: production ? "People" : "Demo profiles",
            icon: Users,
          },
          { id: "assignments", name: "Assignments", icon: Layers },
          { id: "groups", name: "Groups", icon: Layers },
          { id: "teams", name: "Teams", icon: Users },
          { id: "progress", name: "Progress", icon: BarChart3 },
          { id: "feedback", name: "Feedback", icon: FileText },
          { id: "settings", name: "Settings", icon: Layers },
        ].map((t) => (
          <button
            className={tab === t.id ? "selected" : ""}
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setNotice("");
              setQuery("");
            }}
          >
            <t.icon size={17} />
            {t.name}
          </button>
        ))}
      </div>
      {notice && (
        <div className="success" role="status">
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {tab === "settings" ? (
        <SiteSettingsPanel
          data={data}
          onChange={onChange}
          onUpload={onUpload}
          production={production}
        />
      ) : tab === "feedback" ? (
        <FeedbackAdmin data={data} />
      ) : tab === "teams" ? (
        <TeamsAdmin data={data} onChange={onChange} />
      ) : tab === "content" ? (
        <>
          <div className="admin-toolbar">
            <div className="topic-tabs">
              {["all", "doc", "brief", "course"].map((t) => (
                <button
                  className={filter === t ? "selected" : ""}
                  onClick={() => {
                    setFilter(t);
                    setCategory("all");
                  }}
                  key={t}
                >
                  {
                    {
                      all: "All content",
                      doc: "Knowledge",
                      brief: "Field notes",
                      course: "Courses",
                    }[t]
                  }
                </button>
              ))}
            </div>
            <div className="button-group">
              <button className="secondary" onClick={() => create("doc")}>
                <Plus size={15} />
                Article
              </button>
              <button className="secondary" onClick={() => create("brief")}>
                <Plus size={15} />
                Brief
              </button>
              <button className="primary" onClick={() => create("course")}>
                <Plus size={15} />
                Course
              </button>
            </div>
          </div>
          <div className="filter-bar">
            <label>
              Search content
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Title, summary, or folder"
              />
            </label>
            <label>
              Topic / category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">All topics</option>
                {[
                  ...new Set(
                    data.content
                      .filter((c) => filter === "all" || c.kind === filter)
                      .map((c) => c.category),
                  ),
                ]
                  .sort()
                  .map((t) => (
                    <option key={t}>{t}</option>
                  ))}
              </select>
            </label>
            <label>
              Sort content
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="title">Title A–Z</option>
                <option value="updated">Recently updated</option>
                <option value="oldest">Oldest update first</option>
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Content</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.content
                  .filter(
                    (c) =>
                      (filter === "all" || c.kind === filter) &&
                      (category === "all" || c.category === category) &&
                      `${c.title} ${c.summary} ${c.folder}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                  )
                  .sort((a, b) =>
                    sort === "title"
                      ? a.title.localeCompare(b.title)
                      : sort === "updated"
                        ? b.updatedAt.localeCompare(a.updatedAt)
                        : a.updatedAt.localeCompare(b.updatedAt),
                  )
                  .map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.title}</strong>
                        <small>
                          {c.category}
                          {c.folder ? " / " + c.folder : ""}
                        </small>
                      </td>
                      <td>
                        {c.kind === "doc"
                          ? "Article"
                          : c.kind === "brief"
                            ? "Brief"
                            : "Course"}
                      </td>
                      <td>
                        <span className={"status " + c.status}>
                          {production && c.publishedRevision
                            ? c.publishedRevision === c.revision
                              ? "published"
                              : "published · draft changes"
                            : c.status}
                        </span>
                      </td>
                      <td>v{c.version}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setEditing(structuredClone(c))}
                        >
                          Edit
                        </button>

                        {production && c.publishedRevision && (
                          <button
                            className="text-button"
                            onClick={async () => {
                              if (
                                !confirm(
                                  "Unpublish this item? Its draft and history will be kept.",
                                )
                              )
                                return;
                              try {
                                await onChange({
                                  ...data,
                                  content: data.content.filter(
                                    (x) => x.id !== c.id,
                                  ),
                                });
                                setNotice("Content unpublished.");
                              } catch (e) {
                                setNotice((e as Error).message);
                              }
                            }}
                          >
                            Unpublish
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === "people" ? (
        <>
          {production && <PendingPeople data={data} onChange={onChange} />}
          <div className="admin-toolbar">
            <p className="muted">
              {production
                ? "Manage signed-in accounts. Deactivation preserves learning history. Clear managed teams before removing a manager’s access."
                : "Sample profiles for trying role-based assignments. No accounts or emails are created."}
            </p>
            {!production && (
              <button
                className="primary"
                onClick={() =>
                  setPerson({
                    id: id(),
                    name: "",
                    email: "",
                    role: "learner",
                    groups: [],
                    active: true,
                  })
                }
              >
                <Plus size={16} />
                Add demo profile
              </button>
            )}
          </div>
          <div className="filter-bar">
            <label>
              Search profiles
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or email"
              />
            </label>
            <label>
              Role
              <select
                value={peopleRole}
                onChange={(e) => setPeopleRole(e.target.value)}
              >
                <option value="all">All roles</option>
                <option value="learner">Learner</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label>
              Group
              <select
                value={peopleGroup}
                onChange={(e) => setPeopleGroup(e.target.value)}
              >
                <option value="all">All groups</option>
                {data.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Profile status
              <select
                value={peopleStatus}
                onChange={(e) => setPeopleStatus(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label>
              Sort profiles
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="title">Name A–Z</option>
                <option value="reverse">Name Z–A</option>
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Access</th>
                  <th>Groups</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.users
                  .filter(
                    (u) =>
                      `${u.name} ${u.email}`
                        .toLowerCase()
                        .includes(query.toLowerCase()) &&
                      (peopleRole === "all" || u.role === peopleRole) &&
                      (peopleGroup === "all" ||
                        u.groups.includes(peopleGroup)) &&
                      (peopleStatus === "all" ||
                        u.active === (peopleStatus === "active")),
                  )
                  .sort((a, b) =>
                    sort === "reverse"
                      ? b.name.localeCompare(a.name)
                      : a.name.localeCompare(b.name),
                  )
                  .map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        <small>{u.email}</small>
                      </td>
                      <td>{u.role}</td>
                      <td>
                        {data.groups
                          .filter((g) => u.groups.includes(g.id))
                          .map((g) => g.name)
                          .join(", ") || "No groups"}
                      </td>
                      <td>{u.active ? "Active" : "Inactive"}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setPerson(structuredClone(u))}
                        >
                          Edit
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setDetailScope({ userId: u.id })}
                        >
                          Assignments & progress
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === "assignments" ? (
        <Assignments
          data={data}
          onAction={manageLearning}
          onOpenGroup={(groupId) => setDetailScope({ groupId })}
        />
      ) : tab === "groups" ? (
        <>
          <form
            className="group-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = groupName.trim();
              if (!name) return;
              if (
                data.groups.some(
                  (g) => g.name.toLowerCase() === name.toLowerCase(),
                )
              ) {
                setNotice("That group already exists.");
                return;
              }
              try {
                await onChange({
                  ...data,
                  groups: [
                    ...data.groups,
                    { id: id(), name, parentId: groupParent || undefined },
                  ],
                });
                setGroupName("");
                setNotice(
                  "Group added. Assign profiles and courses to this group.",
                );
              } catch (e) {
                setNotice((e as Error).message);
              }
            }}
          >
            <label>
              New group name
              <input
                required
                maxLength={80}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Customer success"
              />
            </label>
            <label>
              Parent group
              <select
                value={groupParent}
                onChange={(e) => setGroupParent(e.target.value)}
              >
                <option value="">Top-level group</option>
                {data.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary">
              <Plus size={16} />
              Create group
            </button>
          </form>
          <div className="knowledge-grid">
            {data.groups.map((g) => (
              <section className="knowledge-section" key={g.id}>
                <Layers />
                <h2>{g.name}</h2>
                <label>
                  Parent group
                  <select
                    value={g.parentId || ""}
                    onChange={(e) =>
                      Promise.resolve(
                        onChange({
                          ...data,
                          groups: data.groups.map((x) =>
                            x.id === g.id
                              ? { ...x, parentId: e.target.value || undefined }
                              : x,
                          ),
                        }),
                      ).catch((e) => setNotice(e.message))
                    }
                  >
                    <option value="">Top-level group</option>
                    {data.groups
                      .filter((x) => canParent(g.id, x.id, data.groups))
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </label>
                <small>Members inherit assignments from parent groups.</small>
                <p>
                  {data.users.filter((u) => u.groups.includes(g.id)).length}{" "}
                  profiles ·{" "}
                  {
                    data.content.filter(
                      (c) =>
                        c.kind === "course" &&
                        c.groups.includes(g.id) &&
                        c.status === "published",
                    ).length
                  }{" "}
                  assigned courses
                </p>
                <button
                  className="primary"
                  onClick={() => setDetailScope({ groupId: g.id })}
                >
                  Manage group
                </button>
                <button
                  onClick={() => {
                    const name = prompt("Group name", g.name)?.trim();
                    if (
                      name &&
                      !data.groups.some(
                        (x) =>
                          x.id !== g.id &&
                          x.name.toLowerCase() === name.toLowerCase(),
                      )
                    )
                      Promise.resolve(
                        onChange({
                          ...data,
                          groups: data.groups.map((x) =>
                            x.id === g.id ? { ...x, name } : x,
                          ),
                        }),
                      ).catch((e) => setNotice(e.message));
                  }}
                >
                  Rename group
                </button>
              </section>
            ))}
          </div>
        </>
      ) : (
        <TeamProgress data={data} user={user} />
      )}
      {person && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={savePerson}>
            <button
              type="button"
              className="modal-close icon-button"
              aria-label="Close profile editor"
              onClick={() => setPerson(null)}
            >
              <X />
            </button>
            <h2>{production ? "Account" : "Demo profile"}</h2>
            <p className="muted">
              {production
                ? "Changes apply to this verified account. Login email is read-only."
                : "Use fictional details. This does not create a secure account."}
            </p>
            <label>
              Name
              <input
                required
                maxLength={80}
                value={person.name}
                onChange={(e) => setPerson({ ...person, name: e.target.value })}
              />
            </label>
            <label>
              {production ? "Login email" : "Email label"}
              <input
                type="email"
                required
                disabled={production}
                value={person.email}
                onChange={(e) =>
                  setPerson({ ...person, email: e.target.value })
                }
              />
            </label>
            <label>
              Access
              <select
                disabled={person.id === user.id}
                value={person.role}
                onChange={(e) =>
                  setPerson({ ...person, role: e.target.value as User["role"] })
                }
              >
                <option value="learner">Learner</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
              </select>
            </label>
            <label>
              Reporting team
              <select
                value={person.teamId || ""}
                onChange={(e) =>
                  setPerson({ ...person, teamId: e.target.value || undefined })
                }
              >
                <option value="">No team</option>
                {(data.teams || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Groups</legend>
              {data.groups.map((g) => (
                <label className="checkbox-label" key={g.id}>
                  <input
                    type="checkbox"
                    checked={person.groups.includes(g.id)}
                    onChange={(e) =>
                      setPerson({
                        ...person,
                        groups: e.target.checked
                          ? [...person.groups, g.id]
                          : person.groups.filter((x) => x !== g.id),
                      })
                    }
                  />
                  {g.name}
                </label>
              ))}
            </fieldset>
            <label className="checkbox-label">
              <input
                type="checkbox"
                disabled={person.id === user.id}
                checked={person.active}
                onChange={(e) =>
                  setPerson({ ...person, active: e.target.checked })
                }
              />
              Active profile
            </label>
            <button className="primary">
              <Save size={16} />
              Save profile
            </button>
          </form>
        </div>
      )}
    </>
  );
}
export function Editor({
  onLearning,
  content,
  data,
  onSave,
  onCancel,
  onUpload,
  production = false,
}: {
  onUpload?: UploadMedia;
  production?: boolean;
  content: Content;
  data: Workspace;
  onSave: (c: Content) => void | Promise<void>;
  onCancel: () => void;
  onLearning?: LearningHandler;
}) {
  const [c, setC] = useState<Content>(() => ({
      ...content,
      assignments:
        content.assignments ??
        content.groups.map((groupId) => ({
          groupId,
          assignedAt: content.createdAt || content.updatedAt,
          due: { type: "none" },
        })),
    })),
    [editorTab, setEditorTab] = useState("content"),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(false),
    [saving, setSaving] = useState(false);
  const existing = data.content.some((x) => x.id === c.id);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      c.kind === "course" &&
      c.status === "published" &&
      (!c.lessons.length ||
        c.lessons.some(
          (l) => !l.title.trim() || (!l.body.trim() && !l.videoUrl),
        ) ||
        c.questions.some(
          (q) =>
            !q.prompt.trim() ||
            q.options.some((o) => !o.trim()) ||
            q.answer === undefined,
        ))
    ) {
      setError(
        "Published courses need at least one complete lesson and valid quiz questions with correct answers.",
      );
      return;
    }
    if (c.lessons.some((l) => l.videoUrl && !videoSource(l.videoUrl))) {
      setError("Use a supported HTTPS YouTube, Vimeo, MP4, or WebM URL.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const latest = data.content.find((x) => x.id === c.id);
      await onSave({
        ...c,
        ...(latest
          ? {
              assignments: latest.assignments,
              groups: latest.groups,
              revision: latest.revision,
            }
          : {}),
        title: c.title.trim(),
        category: c.category.trim(),
        version: existing && refresh ? content.version + 1 : content.version,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const set = (key: string, value: unknown) =>
    setC((prev) => ({ ...prev, [key]: value }));
  if (editorTab === "assignments" && onLearning)
    return (
      <>
        <button className="text-button" onClick={() => setEditorTab("content")}>
          <ArrowLeft size={16} />
          Back to course builder
        </button>
        <h1>{c.title}</h1>
        <Assignments
          data={data}
          scope={{ courseId: c.id }}
          onAction={onLearning}
        />
      </>
    );
  return (
    <form className="editor" onSubmit={submit}>
      <button type="button" className="text-button" onClick={onCancel}>
        <ArrowLeft size={16} />
        Back to content
      </button>
      <div className="editor-heading">
        <div>
          <span className="eyebrow">
            {existing ? "EDIT" : "CREATE"}{" "}
            {c.kind === "doc"
              ? "ARTICLE"
              : c.kind === "brief"
                ? "BRIEF"
                : "COURSE"}
          </span>
          <h1>{existing ? c.title : "Something worth sharing."}</h1>
        </div>
        <button className="primary" disabled={saving}>
          <Save size={16} />
          Save {c.status === "published" ? "& publish" : "draft"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="editor-layout">
        <section className="editor-main">
          <label>
            Title
            <input
              required
              maxLength={160}
              value={c.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Give it a clear, useful title"
            />
          </label>
          <label>
            Short description
            <textarea
              required
              rows={2}
              maxLength={300}
              value={c.summary}
              onChange={(e) => set("summary", e.target.value)}
              placeholder="What will people find here?"
            />
          </label>
          {c.kind !== "course" ? (
            <MarkdownEditor
              label="Article content"
              value={c.body}
              onChange={(value) => set("body", value)}
              onUpload={onUpload}
            />
          ) : (
            <>
              <div className="section-heading">
                <h2>Lessons</h2>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    set("lessons", [
                      ...c.lessons,
                      { id: id(), title: "", body: "" },
                    ])
                  }
                >
                  <Plus size={16} />
                  Add lesson
                </button>
              </div>
              {c.lessons.map((l, i) => (
                <section className="editor-block" key={l.id}>
                  <div className="editor-block-heading">
                    <strong>Lesson {i + 1}</strong>
                    <div>
                      <button
                        type="button"
                        className="text-button"
                        disabled={i === 0}
                        onClick={() => {
                          const next = [...c.lessons];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          set("lessons", next);
                        }}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove lesson ${i + 1}`}
                        onClick={() =>
                          set(
                            "lessons",
                            c.lessons.filter((x) => x.id !== l.id),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <label>
                    Lesson title
                    <input
                      required
                      value={l.title}
                      onChange={(e) =>
                        set(
                          "lessons",
                          c.lessons.map((x) =>
                            x.id === l.id ? { ...x, title: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <MarkdownEditor
                    label={`Lesson ${i + 1} text`}
                    rows={8}
                    value={l.body}
                    onUpload={onUpload}
                    onChange={(value) =>
                      set(
                        "lessons",
                        c.lessons.map((x) =>
                          x.id === l.id ? { ...x, body: value } : x,
                        ),
                      )
                    }
                  />
                  {onUpload && (
                    <label>
                      Upload lesson video{" "}
                      <small>MP4 or WebM, up to 50 MB.</small>
                      <input
                        type="file"
                        accept="video/mp4,video/webm"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setSaving(true);
                          try {
                            const url = await onUpload(f);
                            setC((prev) => ({
                              ...prev,
                              lessons: prev.lessons.map((x) =>
                                x.id === l.id ? { ...x, videoUrl: url } : x,
                              ),
                            }));
                          } catch (error) {
                            setError((error as Error).message);
                          } finally {
                            setSaving(false);
                          }
                        }}
                      />
                    </label>
                  )}
                  <label>
                    Video URL{" "}
                    <small>
                      Optional. YouTube, Vimeo, or a direct HTTPS MP4/WebM URL.
                    </small>
                    <input
                      type="text"
                      placeholder="Upload a file or paste a supported video URL"
                      value={l.videoUrl || ""}
                      onChange={(e) =>
                        set(
                          "lessons",
                          c.lessons.map((x) =>
                            x.id === l.id
                              ? { ...x, videoUrl: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                </section>
              ))}
              <div className="section-heading">
                <h2>Knowledge check</h2>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    set("questions", [
                      ...c.questions,
                      {
                        id: id(),
                        prompt: "",
                        options: ["", "", ""],
                        answer: 0,
                      },
                    ])
                  }
                >
                  <Plus size={16} />
                  Add question
                </button>
              </div>
              <p className="muted">
                Learners must answer every question correctly. Unlimited
                retries.
              </p>
              {c.questions.map((q, i) => (
                <section className="editor-block" key={q.id}>
                  <div className="editor-block-heading">
                    <strong>Question {i + 1}</strong>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove question ${i + 1}`}
                      onClick={() =>
                        set(
                          "questions",
                          c.questions.filter((x) => x.id !== q.id),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <label>
                    Question
                    <input
                      required
                      value={q.prompt}
                      onChange={(e) =>
                        set(
                          "questions",
                          c.questions.map((x) =>
                            x.id === q.id
                              ? { ...x, prompt: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  {q.options.map((o, j) => (
                    <div className="answer-row" key={j}>
                      <input
                        type="radio"
                        aria-label={`Correct answer ${j + 1} for question ${i + 1}`}
                        name={"correct-" + q.id}
                        checked={q.answer === j}
                        onChange={() =>
                          set(
                            "questions",
                            c.questions.map((x) =>
                              x.id === q.id ? { ...x, answer: j } : x,
                            ),
                          )
                        }
                      />
                      <input
                        aria-label={`Answer ${j + 1} for question ${i + 1}`}
                        required
                        value={o}
                        onChange={(e) =>
                          set(
                            "questions",
                            c.questions.map((x) =>
                              x.id === q.id
                                ? {
                                    ...x,
                                    options: x.options.map((a, k) =>
                                      k === j ? e.target.value : a,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                      {q.answer === j && <Check size={16} />}
                    </div>
                  ))}
                  <small>Select the circle next to the correct answer.</small>
                </section>
              ))}
            </>
          )}
        </section>
        <aside className="editor-settings">
          <h3>Publishing</h3>
          {production && (
            <p className="muted">
              Saving a draft keeps the current public version online. Select
              Published to replace it. Unpublish from the content list to remove
              public access.
            </p>
          )}
          <label>
            Status
            <select
              value={c.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label>
            {c.kind === "course" ? "Topic / channel" : "Category"}
            <input
              required
              list="categories"
              value={c.category}
              onChange={(e) => set("category", e.target.value)}
            />
            <datalist id="categories">
              {Array.from(
                new Set(
                  data.content
                    .filter((x) => x.kind === c.kind)
                    .map((x) => x.category),
                ),
              ).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </datalist>
          </label>
          {c.kind === "doc" && (
            <label>
              Folder path <small>Use / for nested folders</small>
              <input
                value={c.folder}
                onChange={(e) => set("folder", e.target.value)}
                placeholder="Getting started / Basics"
              />
            </label>
          )}
          {c.kind === "course" && (
            <>
              <label>
                Estimated minutes
                <input
                  type="number"
                  min={1}
                  max={600}
                  required
                  value={c.duration}
                  onChange={(e) => set("duration", Number(e.target.value))}
                />
              </label>
              <section>
                <h3>Assignments</h3>
                <p className="muted">
                  Manage group and individual assignments separately from course
                  edits.
                </p>
                {existing &&
                (data.publishedContent ?? data.content).some(
                  (x) => x.id === c.id && x.status === "published",
                ) &&
                onLearning ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditorTab("assignments");
                    }}
                  >
                    Manage assignments
                  </button>
                ) : (
                  <p>Publish this course to assign it.</p>
                )}
              </section>
              {existing && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={refresh}
                    onChange={(e) => setRefresh(e.target.checked)}
                  />
                  Publish a new version and require completion again
                </label>
              )}
              <small>
                Current version: {content.version}. Keep this unchecked for
                minor corrections.
              </small>
            </>
          )}
          <div className="demo-note">
            <strong>
              {production ? "Saved to your workspace" : "Saved in your browser"}
            </strong>
            <p>
              {production
                ? "Drafts are visible to administrators. Publish when you are ready to share with readers."
                : "Published content is visible to demo profiles on this device. It is not shared with other visitors."}
            </p>
          </div>
        </aside>
      </div>
    </form>
  );
}
