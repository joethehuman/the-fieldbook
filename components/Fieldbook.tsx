"use client";
import { useEffect, useState } from "react";
import {
  BookOpen,
  GraduationCap,
  Newspaper,
  Search,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Check,
  Play,
  Clock,
  Settings,
  LogOut,
  Plus,
  X,
  Menu,
  Layers,
  CheckCircle2,
  Compass,
  FileText,
  Download,
  RotateCcw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  assignedCourses,
  isComplete,
  type Content,
  type User,
} from "@/lib/types";
import {
  freshWorkspace,
  loadWorkspace,
  saveWorkspace,
  updateProgress,
  SESSION,
  type Workspace,
} from "@/lib/store";
import dynamic from "next/dynamic";
const Admin = dynamic(() => import("./Admin"));
type View = "learn" | "docs" | "briefs" | "admin";
export default function Fieldbook() {
  const [data, setData] = useState<Workspace | null>(null),
    [uid, setUid] = useState<string | null>(null),
    [view, setView] = useState<View>("learn"),
    [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [topic, setTopic] = useState("All topics"),
    [error, setError] = useState(""),
    [menu, setMenu] = useState(false),
    [showDemo, setShowDemo] = useState(false);
  useEffect(() => {
    try {
      setData(loadWorkspace());
      setUid(sessionStorage.getItem(SESSION) || "demo-learner");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const onHash = () => {
      const [v, id] = window.location.hash.slice(1).split("/");
      if (["learn", "docs", "briefs", "admin"].includes(v)) {
        setView(v as View);
        setSelected(id ? decodeURIComponent(id) : null);
      }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  function navigate(v: View, id?: string) {
    setView(v);
    setSelected(id || null);
    setSearch("");
    setMenu(false);
    window.location.hash = v + (id ? "/" + encodeURIComponent(id) : "");
    window.scrollTo({ top: 0 });
  }
  function persist(next: Workspace) {
    try {
      saveWorkspace(next);
      setData(next);
      setError("");
    } catch {
      setError(
        "Your browser could not save this change. Storage may be full or disabled.",
      );
    }
  }
  function login(id: string) {
    sessionStorage.setItem(SESSION, id);
    setUid(id);
    navigate("learn");
  }
  function logout() {
    sessionStorage.removeItem(SESSION);
    setUid(null);
  }
  function reset() {
    if (
      confirm("Reset this browser’s sample content, profiles, and progress?")
    ) {
      const next = freshWorkspace();
      persist(next);
      logout();
      setShowDemo(false);
      navigate("learn");
    }
  }
  function exportData() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "fieldbook-demo.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!data)
    return (
      <div className="loading">
        <BookOpen size={32} />
        <h2>{error || "Opening your fieldbook…"}</h2>
        {error && <button onClick={reset}>Reset demo</button>}
      </div>
    );
  const user = data.users.find((u) => u.id === uid && u.active);
  if (!user)
    return (
      <div className="login-page">
        <div className="login-story">
          <Logo />
          <div>
            <span className="eyebrow">A LITTLE CLARITY GOES A LONG WAY</span>
            <h1>
              Your field.
              <br />
              In focus.
            </h1>
            <p>
              The knowledge you need.
              <br />
              The updates that matter.
              <br />
              The confidence to move forward.
            </p>
            <div className="login-icons">
              <BookOpen />
              <Newspaper />
              <GraduationCap />
            </div>
          </div>
          <small>One home for knowledge, updates, and learning.</small>
        </div>
        <main className="login-form">
          <div className="login-inner">
            <span className="pill">INTERACTIVE PROTOTYPE</span>
            <h2>Welcome to Fieldbook</h2>
            <p>Choose a demo profile to explore the workspace.</p>
            <div className="profile-list">
              {data.users
                .filter((u) => u.active)
                .map((u) => (
                  <button key={u.id} onClick={() => login(u.id)}>
                    <span className="avatar">{initials(u.name)}</span>
                    <span>
                      <strong>{u.name}</strong>
                      <small>
                        {u.role === "admin"
                          ? "Admin · Manage the workspace"
                          : data.groups
                              .filter((g) => u.groups.includes(g.id))
                              .map((g) => g.name)
                              .join(", ") || "Learner"}
                      </small>
                    </span>
                    <ArrowRight size={18} />
                  </button>
                ))}
            </div>
            <div className="demo-note">
              <strong>A working demo, on your terms.</strong>
              <p>
                Changes stay in this browser. Demo profiles are not secure
                accounts, and data is not shared between devices. Use sample
                content only.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  const visible = data.content.filter((c) => c.status === "published");
  const progress = data.progress[user.id] || [];
  const assigned = assignedCourses(visible, user);
  const completed = assigned.filter((c) => isComplete(c, progress)).length;
  const pct = assigned.length
    ? Math.round((completed / assigned.length) * 100)
    : 100;
  const query = search.trim().toLowerCase();
  const results = visible.filter((c) =>
    [c.title, c.summary, c.body, c.category, c.folder]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
  const item = visible.find((c) => c.id === selected);
  const courses = visible.filter((c) => c.kind === "course");
  const topics = Array.from(new Set(courses.map((c) => c.category)));
  const docs = visible.filter((c) => c.kind === "doc");
  const currentTitle =
    view === "learn"
      ? "Learning"
      : view === "docs"
        ? "Knowledge"
        : view === "briefs"
          ? "Field notes"
          : "Workspace";
  return (
    <div className="app">
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <Logo />
        <div className="workspace-label">
          <span className="workspace-icon">F</span>
          <div>
            Field workspace<small>Your team’s shared playbook</small>
          </div>
        </div>
        <span className="nav-label">YOUR WORKSPACE</span>
        <nav>
          {(
            [
              { key: "learn", title: "Learning", icon: GraduationCap },
              { key: "docs", title: "Knowledge", icon: BookOpen },
              { key: "briefs", title: "Field notes", icon: Newspaper },
            ] as const
          ).map((n) => (
            <button
              className={view === n.key ? "active" : ""}
              key={n.key}
              onClick={() => navigate(n.key)}
            >
              <n.icon size={19} />
              {n.title}
              {n.key === "learn" && (
                <span className="nav-count">{assigned.length - completed}</span>
              )}
            </button>
          ))}
        </nav>
        {view === "docs" && (
          <div className="doc-nav">
            {Array.from(new Set(docs.map((d) => d.category))).map((cat) => (
              <details open key={cat}>
                <summary>{cat}</summary>
                <DocFolders
                  docs={docs.filter((d) => d.category === cat)}
                  selected={selected}
                  onOpen={(id) => navigate("docs", id)}
                />
              </details>
            ))}
          </div>
        )}
        <div className="sidebar-bottom">
          <div className="quiet-card">
            <span className="tiny-dot" /> Make space for what matters.
            <p>Stay curious. Stay current.</p>
          </div>
          {user.role === "admin" && (
            <button
              className={"admin-nav " + (view === "admin" ? "active" : "")}
              onClick={() => navigate("admin")}
            >
              <Settings size={18} />
              Manage workspace
            </button>
          )}
          <button
            className="user-menu"
            onClick={logout}
            title="Switch demo profile"
          >
            <span className="avatar">{initials(user.name)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>
                {user.role === "admin" ? "Administrator" : "Field team"}
              </small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{currentTitle}</strong>
            {item && (
              <>
                <ChevronRight size={14} />
                <span className="crumb-item">{item.title}</span>
              </>
            )}
          </div>
          <div className="top-actions">
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Search all content"
                placeholder="Search fieldbook…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="icon-button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <button className="demo-chip" onClick={() => setShowDemo(true)}>
              <span />
              Demo workspace
            </button>
          </div>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <main className="main-content">
          {query ? (
            <>
              <PageHeading
                eyebrow="FIND YOUR NEXT ANSWER"
                title="Search fieldbook"
                description={`${results.length} results for “${search}”`}
              />
              <div className="result-list">
                {results.map((c) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      navigate(
                        c.kind === "course"
                          ? "learn"
                          : c.kind === "doc"
                            ? "docs"
                            : "briefs",
                        c.id,
                      )
                    }
                  >
                    <span className="result-icon">
                      {c.kind === "course" ? (
                        <GraduationCap />
                      ) : c.kind === "doc" ? (
                        <BookOpen />
                      ) : (
                        <Newspaper />
                      )}
                    </span>
                    <span>
                      <small>
                        {c.kind === "course"
                          ? "Learning"
                          : c.kind === "doc"
                            ? "Knowledge"
                            : "Field notes"}{" "}
                        / {c.category}
                      </small>
                      <h3>{c.title}</h3>
                      <p>{c.summary}</p>
                    </span>
                    <ArrowUpRight />
                  </button>
                ))}
                {!results.length && (
                  <Empty
                    title="No results yet"
                    description="Try a different word or browse the workspace."
                  />
                )}
              </div>
            </>
          ) : view === "admin" && user.role === "admin" ? (
            <Admin data={data} user={user} onChange={persist} />
          ) : selected && !item ? (
            <Empty
              title="This content isn’t available"
              description="It may be a draft or have been removed."
            />
          ) : item?.kind === "course" ? (
            <Course
              key={item.id + item.version}
              course={item}
              data={data}
              user={user}
              onChange={persist}
              onBack={() => navigate("learn")}
            />
          ) : item ? (
            <article className="article">
              <button
                className="text-button"
                onClick={() =>
                  navigate(item.kind === "doc" ? "docs" : "briefs")
                }
              >
                ← Back to {item.kind === "doc" ? "knowledge" : "field notes"}
              </button>
              <span className="eyebrow">{item.category}</span>
              <h1>{item.title}</h1>
              <p className="article-lede">{item.summary}</p>
              <div className="article-meta">
                <span className="avatar small">FB</span>
                <span>Fieldbook team</span>
                <span>·</span>
                <span>Updated {date(item.updatedAt)}</span>
                <span>·</span>
                <span>v{item.version}</span>
              </div>
              <div className="markdown">
                <ReactMarkdown>{item.body}</ReactMarkdown>
              </div>
              <div className="article-end">
                <CheckCircle2 size={18} />
                You’re at the end. Put it into practice.
              </div>
            </article>
          ) : view === "learn" ? (
            <>
              <PageHeading
                eyebrow="A LITTLE LEARNING. A LOT OF MOMENTUM."
                title={`Make your next move a great one.`}
                description="Build your knowledge, sharpen your skills, and stay one step ahead."
              />
              <section className="for-you">
                <div className="section-heading">
                  <div>
                    <h2>
                      For you{" "}
                      <span className="count-pill">{assigned.length}</span>
                    </h2>
                    <p>
                      Picked for your role. A clear path to staying current.
                    </p>
                  </div>
                  <span className="role-pill">
                    {data.groups
                      .filter((g) => user.groups.includes(g.id))
                      .map((g) => g.name)
                      .join(" · ") || "No group assigned"}
                  </span>
                </div>
                <div className="assigned-layout">
                  <div className="current-card">
                    <div
                      className="progress-ring"
                      style={{
                        background: `conic-gradient(#0069ff ${pct}%, #e4eaf5 0)`,
                      }}
                      role="img"
                      aria-label={`${pct}% current`}
                    >
                      <div>
                        <strong>
                          {pct}
                          <small>%</small>
                        </strong>
                        <span>current</span>
                      </div>
                    </div>
                    <h3>
                      {pct === 100
                        ? "You’re all caught up."
                        : "Keep your momentum."}
                    </h3>
                    <p>
                      {assigned.length
                        ? `${completed} of ${assigned.length} assigned courses complete`
                        : "No courses assigned yet"}
                    </p>
                    <span className="current-caption">
                      <span className="tiny-dot" />
                      The goal? Stay at 100%.
                    </span>
                  </div>
                  <div className="assigned-courses">
                    {assigned.map((c) => (
                      <CourseCard
                        key={c.id}
                        course={c}
                        complete={isComplete(c, progress)}
                        progress={
                          progress.find(
                            (p) =>
                              p.content_id === c.id && p.version === c.version,
                          )?.lessons.length || 0
                        }
                        onClick={() => navigate("learn", c.id)}
                      />
                    ))}
                    {!assigned.length && (
                      <Empty
                        title="Room to explore"
                        description="Browse the library while you wait for your next assignment."
                      />
                    )}
                  </div>
                </div>
              </section>
              <section className="library">
                <div className="section-heading">
                  <div>
                    <h2>Explore the library</h2>
                    <p>
                      Follow your curiosity. There’s always something to
                      discover.
                    </p>
                  </div>
                  <span className="muted">{courses.length} courses</span>
                </div>
                <div className="topic-tabs">
                  {["All topics", ...topics].map((t) => (
                    <button
                      key={t}
                      className={topic === t ? "selected" : ""}
                      onClick={() => setTopic(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {topics
                  .filter((t) => topic === "All topics" || topic === t)
                  .map((t, i) => (
                    <div className="channel" key={t}>
                      <div className="channel-title">
                        <span className={"channel-icon tone-" + i}>
                          {i === 0 ? (
                            <Compass size={19} />
                          ) : i === 1 ? (
                            <Layers size={19} />
                          ) : (
                            <BookOpen size={19} />
                          )}
                        </span>
                        <h3>{t}</h3>
                        <span>
                          {courses.filter((c) => c.category === t).length}{" "}
                          courses
                        </span>
                      </div>
                      <div className="course-grid">
                        {courses
                          .filter((c) => c.category === t)
                          .map((c) => (
                            <CourseCard
                              key={c.id}
                              course={c}
                              complete={isComplete(c, progress)}
                              onClick={() => navigate("learn", c.id)}
                            />
                          ))}
                      </div>
                    </div>
                  ))}
              </section>
              <div className="bottom-callout">
                <BookOpen size={22} />
                <div>
                  <h3>Looking for an answer?</h3>
                  <p>The knowledge library is your everyday reference.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => navigate("docs")}
                >
                  Explore knowledge <ArrowRight size={17} />
                </button>
              </div>
            </>
          ) : view === "docs" ? (
            <>
              <PageHeading
                eyebrow="THE KNOWLEDGE THAT GOES WITH YOU"
                title="Your everyday reference."
                description="A shared source of truth. Built for the conversations that matter."
              />
              <div
                className="knowledge-feature"
                onClick={() => navigate("docs", "start")}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate("docs", "start");
                }}
              >
                <div>
                  <span className="eyebrow">START HERE</span>
                  <h2>A good place to begin.</h2>
                  <p>
                    Get oriented, find your way, and make this fieldbook yours.
                  </p>
                  <span className="text-button">
                    Open the guide <ArrowRight size={17} />
                  </span>
                </div>
                <BookOpen size={76} strokeWidth={1} />
              </div>
              <div className="knowledge-grid">
                {Array.from(new Set(docs.map((d) => d.category))).map((cat) => (
                  <section className="knowledge-section" key={cat}>
                    <BookOpen size={22} />
                    <h2>{cat}</h2>
                    <p>
                      {docs.filter((d) => d.category === cat).length} articles
                    </p>
                    {docs
                      .filter((d) => d.category === cat)
                      .map((d) => (
                        <button
                          onClick={() => navigate("docs", d.id)}
                          key={d.id}
                        >
                          {d.title}
                          <ChevronRight size={16} />
                        </button>
                      ))}
                  </section>
                ))}
              </div>
            </>
          ) : (
            <>
              <PageHeading
                eyebrow="LESS NOISE. MORE SIGNAL."
                title="Notes from the field."
                description="The latest updates, launch briefs, and ideas worth sharing."
              />
              <div className="brief-list">
                {visible
                  .filter((c) => c.kind === "brief")
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .map((b, i) => (
                    <button
                      className={"brief-card " + (i === 0 ? "featured" : "")}
                      key={b.id}
                      onClick={() => navigate("briefs", b.id)}
                    >
                      <div className={"brief-art art-" + i}>
                        <span>
                          FIELD
                          <br />
                          NOTES<span className="art-number">0{i + 1}</span>
                        </span>
                        <ArrowUpRight size={36} />
                      </div>
                      <div className="brief-copy">
                        <span className="eyebrow">{b.category}</span>
                        <h2>{b.title}</h2>
                        <p>{b.summary}</p>
                        <span className="brief-date">
                          {date(b.updatedAt)}{" "}
                          <span>
                            Read the brief <ArrowRight size={16} />
                          </span>
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            </>
          )}
          <footer>
            Fieldbook <span>A shared place to get better.</span>
            <button onClick={() => setShowDemo(true)}>About this demo</button>
          </footer>
        </main>
      </div>
      {showDemo && (
        <div className="modal-backdrop" onClick={() => setShowDemo(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="About this demo"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              onClick={() => setShowDemo(false)}
              aria-label="Close"
            >
              <X />
            </button>
            <span className="eyebrow">YOUR DEMO WORKSPACE</span>
            <h2>
              A small prototype.
              <br />A big starting point.
            </h2>
            <p>
              This Next.js demo runs entirely in your browser. Content,
              profiles, assignments, and progress are saved here, on this
              device.
            </p>
            <p>
              Profiles simulate login and roles; they are not secure accounts.
              Don’t enter private information. Nothing is synced to a server.
            </p>
            <div className="modal-actions">
              <button className="secondary" onClick={exportData}>
                <Download size={16} />
                Export demo data
              </button>
              <button className="secondary" onClick={reset}>
                <RotateCcw size={16} />
                Reset sample data
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span>
        <BookOpen size={22} strokeWidth={2.3} />
      </span>
      fieldbook<span className="logo-period">.</span>
    </div>
  );
}
function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
}
function date(s: string) {
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty">
      <Compass size={28} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
function CourseCard({
  course: c,
  complete,
  progress = 0,
  onClick,
}: {
  course: Content;
  complete: boolean;
  progress?: number;
  onClick: () => void;
}) {
  const index = Number(c.id.replace(/\D/g, "")) || 1;
  return (
    <button className="course-card" onClick={onClick}>
      <div className={"course-art art-" + (index % 6)}>
        <div className="art-grid" />
        <span className="art-label">{c.category}</span>
        <div className={"abstract abstract-" + (index % 3)}>
          <i />
          <i />
          <i />
        </div>
        <span className="play-disc">
          <Play size={17} fill="currentColor" />
        </span>
        <span className="duration">{c.duration} min</span>
      </div>
      <div className="course-copy">
        <div className="course-meta">
          {complete ? (
            <span className="completed">
              <CheckCircle2 size={13} />
              Completed
            </span>
          ) : progress ? (
            <span className="in-progress">In progress</span>
          ) : (
            <span>{c.lessons.length} lessons · Knowledge check</span>
          )}
        </div>
        <h3>{c.title}</h3>
        <p>{c.summary}</p>
        <div className="course-bottom">
          <span>
            {complete
              ? "Review course"
              : progress
                ? "Continue learning"
                : "Start learning"}
          </span>
          <ArrowUpRight size={17} />
        </div>
      </div>
    </button>
  );
}
function Course({
  course: c,
  data,
  user,
  onChange,
  onBack,
}: {
  course: Content;
  data: Workspace;
  user: User;
  onChange: (d: Workspace) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState(0),
    [answers, setAnswers] = useState<number[]>([]),
    [result, setResult] = useState<string | null>(null);
  const p = (data.progress[user.id] || []).find(
    (p) => p.content_id === c.id && p.version === c.version,
  );
  const lesson = c.lessons[step];
  const allDone = c.lessons.every((l) => p?.lessons.includes(l.id));
  const complete = isComplete(c, data.progress[user.id] || []);
  function mark() {
    if (lesson) onChange(updateProgress(data, user.id, c, lesson.id));
    setStep(Math.min(step + 1, c.lessons.length));
  }
  function submit() {
    const passed = c.questions.every((q, i) => answers[i] === q.answer);
    onChange(updateProgress(data, user.id, c, undefined, answers));
    setResult(
      passed
        ? "Great work. You’ve completed this course."
        : "Not quite yet. Revisit the lessons and try again.",
    );
  }
  return (
    <div className="course-detail">
      <button className="text-button" onClick={onBack}>
        ← Back to learning
      </button>
      <div className="course-detail-heading">
        <span className="eyebrow">{c.category}</span>
        <h1>{c.title}</h1>
        <p>{c.summary}</p>
        <div className="course-detail-meta">
          <Clock size={16} />
          {c.duration} min <span>·</span>
          {c.lessons.length} lessons<span>·</span>
          {complete ? (
            <span className="completed">Completed</span>
          ) : (
            "At your own pace"
          )}
        </div>
      </div>
      <div className="lesson-layout">
        <aside className="lesson-nav">
          <h3>In this course</h3>
          {c.lessons.map((l, i) => (
            <button
              className={step === i ? "selected" : ""}
              onClick={() => setStep(i)}
              key={l.id}
            >
              <span
                className={
                  "step-number " + (p?.lessons.includes(l.id) ? "done" : "")
                }
              >
                {p?.lessons.includes(l.id) ? <Check size={13} /> : i + 1}
              </span>
              {l.title}
            </button>
          ))}
          <button
            className={step === c.lessons.length ? "selected" : ""}
            onClick={() => setStep(c.lessons.length)}
          >
            <CheckCircle2 size={18} />
            {c.questions.length ? "Knowledge check" : "Finish course"}
          </button>
          <div className="lesson-progress">
            <div>
              <span
                style={{
                  width: `${c.lessons.length ? ((p?.lessons.length || 0) / c.lessons.length) * 100 : 0}%`,
                }}
              />
            </div>
            <small>
              {p?.lessons.length || 0} of {c.lessons.length} lessons complete
            </small>
          </div>
        </aside>
        <section className="lesson-content">
          {lesson ? (
            <>
              <span className="eyebrow">
                LESSON {step + 1} OF {c.lessons.length}
              </span>
              <h2>{lesson.title}</h2>
              {lesson.videoUrl && (
                <video
                  key={lesson.videoUrl}
                  controls
                  preload="metadata"
                  src={lesson.videoUrl}
                >
                  Your browser does not support video playback.
                </video>
              )}
              <div className="markdown">
                <ReactMarkdown>{lesson.body}</ReactMarkdown>
              </div>
              <div className="lesson-actions">
                {p?.lessons.includes(lesson.id) && (
                  <span className="completed">
                    <CheckCircle2 size={16} />
                    Lesson completed
                  </span>
                )}
                <button className="primary" onClick={mark}>
                  {step === c.lessons.length - 1
                    ? "Continue to knowledge check"
                    : "Complete & continue"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="eyebrow">PUT YOUR KNOWLEDGE TO WORK</span>
              <h2>{complete ? "Nicely done." : "A quick knowledge check."}</h2>
              <p>
                Answer every question correctly to complete the course. You can
                try again as often as you need.
              </p>
              {!allDone && (
                <div className="notice">
                  Complete all lessons before submitting your answers.
                </div>
              )}
              {c.questions.map((q, i) => (
                <fieldset className="quiz-question" key={q.id}>
                  <legend>
                    {i + 1}. {q.prompt}
                  </legend>
                  {q.options.map((o, j) => (
                    <label className={answers[i] === j ? "chosen" : ""} key={j}>
                      <input
                        type="radio"
                        name={q.id}
                        checked={answers[i] === j}
                        onChange={() => {
                          const next = [...answers];
                          next[i] = j;
                          setAnswers(next);
                          setResult(null);
                        }}
                      />
                      {o}
                    </label>
                  ))}
                </fieldset>
              ))}
              {result && (
                <div role="status" className={complete ? "success" : "notice"}>
                  {result}
                </div>
              )}
              <div className="lesson-actions">
                <button className="secondary" onClick={() => setStep(0)}>
                  Review lessons
                </button>
                <button
                  className="primary"
                  disabled={
                    !allDone ||
                    c.questions.some((_, i) => answers[i] === undefined)
                  }
                  onClick={submit}
                >
                  {c.questions.length ? "Check answers" : "Complete course"}
                  <Check size={16} />
                </button>
              </div>
              {complete && (
                <button className="text-button" onClick={onBack}>
                  Back to your learning <ArrowRight size={16} />
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function DocFolders({
  docs,
  selected,
  onOpen,
  depth = 0,
}: {
  docs: Content[];
  selected: string | null;
  onOpen: (id: string) => void;
  depth?: number;
}) {
  const path = (d: Content) =>
    d.folder
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
  const folders = Array.from(
    new Set(docs.map((d) => path(d)[depth]).filter(Boolean)),
  );
  return (
    <>
      {docs
        .filter((d) => path(d).length === depth)
        .map((d) => (
          <button
            key={d.id}
            className={selected === d.id ? "selected" : ""}
            onClick={() => onOpen(d.id)}
          >
            {d.title}
          </button>
        ))}
      {folders.map((folder) => (
        <details className="nested-folder" open key={folder}>
          <summary>{folder}</summary>
          <DocFolders
            docs={docs.filter((d) => path(d)[depth] === folder)}
            selected={selected}
            onOpen={onOpen}
            depth={depth + 1}
          />
        </details>
      ))}
    </>
  );
}
