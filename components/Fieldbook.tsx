"use client";
import { useEffect, useState, type CSSProperties } from "react";
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
import ReactMarkdown from "./Markdown";
import type { FieldbookRuntime } from "@/lib/runtime";
import { sectionPaths } from "@/lib/navigation";
import { defaultSettings, privacyHref } from "@/lib/settings";
import Learning from "./Learning";
import Feedback from "./Feedback";
import { TeamProgress } from "./Teams";
import { videoSource } from "@/lib/video";
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
type View = "learn" | "docs" | "briefs" | "admin" | "team";
export default function Fieldbook({
  runtime,
}: { runtime?: FieldbookRuntime } = {}) {
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
    if (runtime) {
      runtime
        .load()
        .then(({ data, user }) => {
          setData(data);
          setUid(user?.id || "guest");
        })
        .catch((e) => {
          setError(e.message);
        });
      return;
    }
    try {
      setData(loadWorkspace());
      setUid(sessionStorage.getItem(SESSION) || "demo-learner");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const onHash = () => {
      let [v, id] = window.location.hash.slice(1).split("/");
      if (runtime && !window.location.hash) {
        const parts = window.location.pathname.split("/");
        v =
          Object.entries(sectionPaths).find(
            ([, path]) => path === parts[1],
          )?.[0] || "learn";
        id = parts[2];
      }
      if (["learn", "docs", "briefs", "admin", "team"].includes(v)) {
        setView(v as View);
        setSelected(id ? decodeURIComponent(id) : null);
      }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);
  function navigate(v: View, id?: string) {
    setView(v);
    setSelected(id || null);
    setSearch("");
    setMenu(false);
    if (runtime)
      window.history.pushState(
        null,
        "",
        `/${sectionPaths[v]}${id ? "/" + encodeURIComponent(id) : ""}`,
      );
    else window.location.hash = v + (id ? "/" + encodeURIComponent(id) : "");
    window.scrollTo({ top: 0 });
  }
  async function persist(next: Workspace) {
    if (runtime && data) {
      try {
        setData(await runtime.save(data, next));
        setError("");
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
      return;
    }
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
    if (runtime) {
      if (uid === "guest") runtime.signIn();
      else void runtime.signOut();
      return;
    }
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
        {error &&
          (runtime ? (
            <>
              <a className="primary" href="/sign-in">
                Sign in
              </a>
              <button onClick={() => window.location.reload()}>
                Try again
              </button>
            </>
          ) : (
            <button onClick={reset}>Reset demo</button>
          ))}
      </div>
    );
  const user =
    data.users.find((u) => u.id === uid && u.active) ||
    (runtime && uid === "guest"
      ? {
          id: "guest",
          name: "Guest",
          email: "",
          role: "learner" as const,
          groups: [],
          active: true,
        }
      : undefined);
  const branding = { ...defaultSettings, ...data.settings };
  if (!user)
    return (
      <div className="login-page">
        <div className="login-story">
          <Logo name={data.settings?.name} logoUrl={data.settings?.logoUrl} />
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
  const visible = (data.publishedContent || data.content).filter(
    (c) => c.status === "published",
  );
  const progress = data.progress[user.id] || [];
  const assigned = assignedCourses(visible, user, data.groups);
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
          : view === "team"
            ? "Team progress"
            : "Workspace";
  return (
    <div
      className="app"
      style={
        {
          "--accent": branding.accent,
          "--blue": branding.accent,
        } as CSSProperties
      }
    >
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <Logo name={data.settings?.name} logoUrl={data.settings?.logoUrl} />
        <span className="nav-label">YOUR WORKSPACE</span>
        <nav>
          {(
            [
              { key: "briefs", title: "Field notes", icon: Newspaper },
              { key: "learn", title: "Learning", icon: GraduationCap },
              { key: "docs", title: "Knowledge", icon: BookOpen },
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
          {user.role === "admin" && (
            <button
              className={"admin-nav " + (view === "admin" ? "active" : "")}
              onClick={() => navigate("admin")}
            >
              <Settings size={18} />
              Manage workspace
            </button>
          )}
          {(user.role === "manager" ||
            (data.teams || []).some((t) => t.managerId === user.id)) && (
            <button className="admin-nav" onClick={() => navigate("team")}>
              <GraduationCap size={18} />
              My team’s progress
            </button>
          )}
          <button
            className="user-menu"
            onClick={logout}
            title={
              runtime
                ? uid === "guest"
                  ? "Sign in"
                  : "Sign out"
                : "Switch demo profile"
            }
          >
            <span className="avatar">{initials(user.name)}</span>
            <span>
              <strong>
                {runtime && uid === "guest" ? "Sign in with Google" : user.name}
              </strong>
              <small>
                {user.role === "admin"
                  ? "Administrator"
                  : user.role === "manager"
                    ? "Manager"
                    : runtime
                      ? uid === "guest"
                        ? "Save progress across devices"
                        : "Learner"
                      : "Field team"}
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
            {!runtime && (
              <button className="demo-chip" onClick={() => setShowDemo(true)}>
                <span />
                Demo workspace
              </button>
            )}
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
            <Admin
              data={data}
              user={user}
              onChange={persist}
              onLearning={
                runtime
                  ? async (action) => {
                      setData(await runtime.manageLearning(action));
                    }
                  : undefined
              }
              production={!!runtime}
              onUpload={runtime?.upload}
            />
          ) : view === "admin" && runtime ? (
            <section className="empty">
              <h2>Administration requires an authorized account.</h2>
              <p>
                Sign in with your administrator account to manage this
                Fieldbook.
              </p>
              <button className="primary" onClick={runtime.signIn}>
                Sign in with Google
              </button>
            </section>
          ) : view === "team" ? (
            <>
              <PageHeading
                eyebrow="GROW TOGETHER"
                title="Your team, in focus."
                description="A shared view of progress and what’s next."
              />
              <TeamProgress data={data} user={user} />
            </>
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
              runtime={runtime}
              onProgress={async (lessonId, answers) => {
                if (!runtime) return undefined;
                const r = await runtime.progress(
                  item,
                  data.progress[user.id] || [],
                  lessonId,
                  answers,
                );
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        progress: { ...prev.progress, [user.id]: r.progress },
                      }
                    : prev,
                );
                return r.attemptPassed;
              }}
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
                <span>{branding.name}</span>
                <span>·</span>
                <span>Updated {date(item.updatedAt)}</span>
                <span>·</span>
                <span>v{item.version}</span>
              </div>
              <div className="markdown">
                <ReactMarkdown>{item.body}</ReactMarkdown>
              </div>
              {(!runtime || user.id !== "guest") && (
                <Feedback
                  key={item.id + user.id}
                  content={item}
                  user={user}
                  data={data}
                  onChange={persist}
                />
              )}
              <div className="article-end">
                <CheckCircle2 size={18} />
                You’re at the end. Put it into practice.
              </div>
            </article>
          ) : view === "learn" ? (
            <Learning
              key={user.id}
              courses={courses}
              user={user}
              groups={data.groups}
              assigned={assigned}
              settings={data.settings}
              progress={progress}
              onOpen={(id) => navigate("learn", id)}
              onKnowledge={() => navigate("docs")}
              publicLearning={!!runtime && uid === "guest"}
              guest={!!runtime && uid === "guest"}
              onSignIn={runtime?.signIn}
            />
          ) : view === "docs" ? (
            <>
              <PageHeading
                eyebrow="THE KNOWLEDGE THAT GOES WITH YOU"
                title="Your everyday reference."
                description="A shared source of truth. Built for the conversations that matter."
              />
              {docs.some((d) => d.id === "start") && (
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
                      Get oriented, find your way, and make this fieldbook
                      yours.
                    </p>
                    <span className="text-button">
                      Open the guide <ArrowRight size={17} />
                    </span>
                  </div>
                  <BookOpen size={76} strokeWidth={1} />
                </div>
              )}
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
            {branding.name} <span>{branding.tagline}</span>
            {privacyHref(branding) && (
              <a href={privacyHref(branding)!}>Privacy policy</a>
            )}
            {!runtime && (
              <button onClick={() => setShowDemo(true)}>About this demo</button>
            )}
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
function Logo({
  name = "fieldbook",
  logoUrl,
}: {
  name?: string;
  logoUrl?: string;
}) {
  return (
    <div className="logo">
      <span>
        {logoUrl ? (
          <img src={logoUrl} alt="" />
        ) : (
          <BookOpen size={22} strokeWidth={2.3} />
        )}
      </span>
      {name}
      <span className="logo-period">.</span>
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
export function Course({
  course: c,
  data,
  user,
  onChange,
  onBack,
  runtime,
  onProgress,
}: {
  runtime?: FieldbookRuntime;
  onProgress?: (
    lessonId?: string,
    answers?: number[],
  ) => Promise<boolean | undefined>;
  course: Content;
  data: Workspace;
  user: User;
  onChange: (d: Workspace) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState(0),
    [answers, setAnswers] = useState<number[]>([]),
    [result, setResult] = useState<string | null>(null),
    [resultPassed, setResultPassed] = useState(false),
    [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState("");
  const p = (data.progress[user.id] || []).find(
    (p) => p.content_id === c.id && p.version === c.version,
  );
  const lesson = c.lessons[step];
  const video = lesson?.videoUrl ? videoSource(lesson.videoUrl) : null;
  const allDone = c.lessons.every((l) => p?.lessons.includes(l.id));
  const complete = isComplete(c, data.progress[user.id] || []);
  async function mark() {
    setBusy(true);
    setSaveError("");
    try {
      if (lesson) {
        if (runtime) await onProgress?.(lesson.id);
        else onChange(updateProgress(data, user.id, c, lesson.id));
      }
      setStep(Math.min(step + 1, c.lessons.length));
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setSaveError("");
    try {
      const passed = runtime
        ? !!(await onProgress?.(undefined, answers))
        : c.questions.every((q, i) => answers[i] === q.answer);
      if (!runtime)
        onChange(updateProgress(data, user.id, c, undefined, answers));
      setResultPassed(passed);
      setResult(
        passed
          ? "Great work. You’ve completed this course."
          : complete
            ? "This attempt did not pass. Your previous completion is preserved."
            : "Not quite yet. Revisit the lessons and try again.",
      );
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
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
      {runtime && user.id === "guest" && (
        <div className="guest-progress-note">
          Your progress is saved in this browser.{" "}
          <button className="text-button" onClick={runtime.signIn}>
            Sign in to keep it across devices →
          </button>
        </div>
      )}
      {saveError && (
        <p className="error" role="alert">
          {saveError}
        </p>
      )}
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
              {video?.type === "embed" ? (
                <iframe
                  className="lesson-video"
                  key={video.url}
                  src={video.url}
                  title={lesson.title + " video"}
                  allow="fullscreen; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : video?.type === "file" ? (
                <video
                  key={video.url}
                  controls
                  preload="metadata"
                  src={video.url}
                >
                  Your browser does not support video playback.
                </video>
              ) : lesson.videoUrl ? (
                <p className="notice">
                  This video URL is not supported. Ask an editor to update it.
                </p>
              ) : null}
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
                <button className="primary" onClick={mark} disabled={busy}>
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
                <div
                  role="status"
                  className={resultPassed ? "success" : "notice"}
                >
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
                    busy ||
                    !allDone ||
                    c.questions.some((_, i) => answers[i] === undefined)
                  }
                  onClick={submit}
                >
                  {c.questions.length ? "Check answers" : "Complete course"}
                  <Check size={16} />
                </button>
              </div>
              {(!runtime || user.id !== "guest") && (
                <Feedback
                  key={c.id + user.id}
                  content={c}
                  user={user}
                  data={data}
                  onChange={onChange}
                />
              )}
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
