"use client";
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
import type { Workspace } from "@/lib/store";
import {
  assignedCourses,
  isComplete,
  type Content,
  type User,
} from "@/lib/types";
type Props = { data: Workspace; user: User; onChange: (d: Workspace) => void };
const id = () => crypto.randomUUID();
export default function Admin({ data, user, onChange }: Props) {
  const [tab, setTab] = useState("content"),
    [editing, setEditing] = useState<Content | null>(null),
    [person, setPerson] = useState<User | null>(null),
    [groupName, setGroupName] = useState(""),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("all");
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
      duration: 5,
      groups: [],
      lessons:
        kind === "course" ? [{ id: id(), title: "Lesson 1", body: "" }] : [],
      questions: [],
    });
  }
  function save(c: Content) {
    const old = data.content.find((x) => x.id === c.id);
    const updated = { ...c, updatedAt: new Date().toISOString() };
    onChange({
      ...data,
      content: old
        ? data.content.map((x) => (x.id === c.id ? updated : x))
        : [...data.content, updated],
    });
    setEditing(null);
    setNotice("Content saved in this browser.");
  }
  function savePerson(e: React.FormEvent) {
    e.preventDefault();
    if (!person) return;
    if (
      data.users.some(
        (u) =>
          u.id !== person.id &&
          u.email.toLowerCase() === person.email.toLowerCase(),
      )
    ) {
      setNotice("A demo profile already uses that email.");
      return;
    }
    onChange({
      ...data,
      users: data.users.some((u) => u.id === person.id)
        ? data.users.map((u) => (u.id === person.id ? person : u))
        : [...data.users, person],
    });
    setPerson(null);
    setNotice("Demo profile saved.");
  }
  if (editing)
    return (
      <Editor
        key={editing.id}
        content={editing}
        data={data}
        onSave={save}
        onCancel={() => setEditing(null)}
      />
    );
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
          { id: "people", name: "Demo profiles", icon: Users },
          { id: "groups", name: "Groups", icon: Layers },
          { id: "progress", name: "Progress", icon: BarChart3 },
        ].map((t) => (
          <button
            className={tab === t.id ? "selected" : ""}
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setNotice("");
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
      {tab === "content" ? (
        <>
          <div className="admin-toolbar">
            <div className="topic-tabs">
              {["all", "doc", "brief", "course"].map((t) => (
                <button
                  className={filter === t ? "selected" : ""}
                  onClick={() => setFilter(t)}
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
                  .filter((c) => filter === "all" || c.kind === filter)
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
                        <span className={"status " + c.status}>{c.status}</span>
                      </td>
                      <td>v{c.version}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setEditing(structuredClone(c))}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === "people" ? (
        <>
          <div className="admin-toolbar">
            <p className="muted">
              Sample profiles for trying role-based assignments. No accounts or
              emails are created.
            </p>
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
                {data.users.map((u) => (
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === "groups" ? (
        <>
          <form
            className="group-form"
            onSubmit={(e) => {
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
              onChange({
                ...data,
                groups: [...data.groups, { id: id(), name }],
              });
              setGroupName("");
              setNotice(
                "Group added. Assign profiles and courses to this group.",
              );
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
                <ul>
                  {data.content
                    .filter(
                      (c) => c.kind === "course" && c.groups.includes(g.id),
                    )
                    .map((c) => (
                      <li key={c.id}>
                        {c.title}
                        {c.status === "draft" ? " (draft)" : ""}
                      </li>
                    ))}
                </ul>
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
                      onChange({
                        ...data,
                        groups: data.groups.map((x) =>
                          x.id === g.id ? { ...x, name } : x,
                        ),
                      });
                  }}
                >
                  Rename group
                </button>
              </section>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Completion is based on each profile’s current published assignments
            and course versions.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Assigned</th>
                  <th>Completed</th>
                  <th>Current</th>
                </tr>
              </thead>
              <tbody>
                {data.users
                  .filter((u) => u.active)
                  .map((u) => {
                    const assigned = assignedCourses(data.content, u);
                    const complete = assigned.filter((c) =>
                      isComplete(c, data.progress[u.id] || []),
                    ).length;
                    const pct = assigned.length
                      ? Math.round((complete / assigned.length) * 100)
                      : 100;
                    return (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name}</strong>
                          <small>{u.email}</small>
                        </td>
                        <td>{assigned.length}</td>
                        <td>{complete}</td>
                        <td>
                          <div className="report-progress">
                            <span>
                              <i style={{ width: pct + "%" }} />
                            </span>
                            <strong>{pct}%</strong>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
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
            <h2>Demo profile</h2>
            <p className="muted">
              Use fictional details. This does not create a secure account.
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
              Email label
              <input
                type="email"
                required
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
function Editor({
  content,
  data,
  onSave,
  onCancel,
}: {
  content: Content;
  data: Workspace;
  onSave: (c: Content) => void;
  onCancel: () => void;
}) {
  const [c, setC] = useState(content),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(false);
  const existing = data.content.some((x) => x.id === c.id);
  function submit(e: React.FormEvent) {
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
    if (c.lessons.some((l) => l.videoUrl && !/^https:\/\//.test(l.videoUrl))) {
      setError("Use a secure HTTPS video URL.");
      return;
    }
    onSave({
      ...c,
      title: c.title.trim(),
      category: c.category.trim(),
      version: existing && refresh ? content.version + 1 : content.version,
    });
  }
  const set = (key: string, value: unknown) =>
    setC((prev) => ({ ...prev, [key]: value }));
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
        <button className="primary">
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
            <label>
              Article content{" "}
              <small>
                Markdown supported: ## headings, **bold**, lists, and links.
              </small>
              <textarea
                className="body-editor"
                rows={18}
                value={c.body}
                onChange={(e) => set("body", e.target.value)}
                placeholder="## Start with what matters"
              />
            </label>
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
                  <label>
                    Lesson text <small>Markdown supported</small>
                    <textarea
                      rows={8}
                      value={l.body}
                      onChange={(e) =>
                        set(
                          "lessons",
                          c.lessons.map((x) =>
                            x.id === l.id ? { ...x, body: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Video URL{" "}
                    <small>
                      Optional. Direct HTTPS MP4/WebM URL, including
                      DigitalOcean Spaces URLs. Not a YouTube page.
                    </small>
                    <input
                      type="url"
                      placeholder="https://…/lesson.mp4"
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
              <fieldset>
                <legend>Assign to groups</legend>
                <p className="muted">
                  Appears in For you for every profile in these groups.
                </p>
                {data.groups.map((g) => (
                  <label key={g.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={c.groups.includes(g.id)}
                      onChange={(e) =>
                        set(
                          "groups",
                          e.target.checked
                            ? [...c.groups, g.id]
                            : c.groups.filter((x) => x !== g.id),
                        )
                      }
                    />
                    {g.name}
                  </label>
                ))}
              </fieldset>
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
            <strong>Saved in your browser</strong>
            <p>
              Published content is visible to demo profiles on this device. It
              is not shared with other visitors.
            </p>
          </div>
        </aside>
      </div>
    </form>
  );
}
