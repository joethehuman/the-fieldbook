"use client";
import { InitialsAvatar } from "./ui/initials-avatar";
import { RequestError } from "@/lib/workspace-save";
import { BrandedAccount } from "./patterns/branded-account";
import { InstallationIdentity as Logo } from "./patterns/installation-identity";
import { brandingFromSettings } from "@/lib/branding";
import { CurriculumPage } from "./CurriculumPage";
import { Badge } from "@/components/ui/badge";
import { SkipLink } from "./patterns/skip-link";
import { AccountButton } from "./patterns/account-button";
import { SearchField } from "./patterns/search-field";
import { NavigationButton } from "./patterns/navigation-button";
import { Card } from "./ui/card";
import { Progress } from "./ui/progress";
import { Radio } from "@/components/ui/choice";
import { ActionGroup } from "@/components/ui/action-group";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup } from "@/components/ui/field";
import { Toolbar, EmptyState, PageHeader } from "@/components/patterns/layout";
import Updates from "./Updates";
import { reconcileLearning } from "@/lib/learning-groups";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BookOpen,
  GraduationCap,
  Newspaper,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Check,
  Clock,
  Settings,
  LogOut,
  X,
  Menu,
  CheckCircle2,
  Compass,
  Download,
  RotateCcw,
} from "lucide-react";
import ReactMarkdown from "./Markdown";
import type { FieldbookRuntime } from "@/lib/runtime";
import { sectionPaths, resolveSection } from "@/lib/navigation";
import { orderedDocCategories } from "@/lib/docs-navigation";
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
  DEMO_PROFILE_IDS,
  type Workspace,
} from "@/lib/store";
import dynamic from "next/dynamic";
import { SaveRecoveryError } from "@/lib/save-recovery";
import type { NavigationGuard } from "@/lib/navigation-guard";
const Admin = dynamic(() => import("./Admin"));
type View = "learn" | "docs" | "briefs" | "admin" | "team";
export default function Fieldbook({
  runtime,
}: { runtime?: FieldbookRuntime } = {}) {
  const { confirm } = useInteractionDialog();
  const navigationGuard = useRef<NavigationGuard | null>(null);
  const acceptedUrl = useRef("");
  const checkingNavigation = useRef(false);
  async function canLeave() {
    if (checkingNavigation.current) return false;
    checkingNavigation.current = true;
    try {
      return await (navigationGuard.current?.() ?? true);
    } finally {
      checkingNavigation.current = false;
    }
  }
  const [data, setData] = useState<Workspace | null>(null),
    [uid, setUid] = useState<string | null>(null),
    [view, setView] = useState<View>("learn"),
    [courseOrigin, setCourseOrigin] = useState<string | undefined>(undefined),
    [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
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
          if (e instanceof RequestError && e.status === 401) {
            runtime.signIn();
            return;
          }
          setError(e.message);
        });
      return;
    }
    try {
      setData(loadWorkspace());
      const savedProfile = sessionStorage.getItem(SESSION);
      setUid(
        savedProfile && DEMO_PROFILE_IDS.includes(savedProfile)
          ? savedProfile
          : "demo-learner",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    acceptedUrl.current = window.location.href;
    let checkingHistory = false;
    const onHash = async () => {
      if (checkingHistory) return;
      checkingHistory = true;
      try {
        const destination = window.location.href;
        if (destination !== acceptedUrl.current && !(await canLeave())) {
          window.history.pushState(null, "", acceptedUrl.current);
          return;
        }
        acceptedUrl.current = destination;
        let [v, id] = window.location.hash.slice(1).split("/");
        if (runtime && !window.location.hash) {
          const parts = window.location.pathname.split("/");
          v = parts[1] || "courses";
          id = parts[2];
        }
        const section = resolveSection(v);
        if (section) {
          setView(section);
          setSelected(
            id
              ? (v === "curricula" ? "curriculum:" : "") +
                  decodeURIComponent(id)
              : null,
          );
          setCourseOrigin(
            new URLSearchParams(window.location.search).get("curriculum") ||
              undefined,
          );
        }
      } finally {
        checkingHistory = false;
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
  async function navigate(v: View, id?: string, origin?: string) {
    setMenu(false);
    if (!(await canLeave())) return;
    setView(v);
    setSelected(id || null);
    setCourseOrigin(origin);
    setSearch("");
    setMenu(false);
    const curriculum = v === "learn" && id?.startsWith("curriculum:");
    const path = curriculum
      ? `curricula/${encodeURIComponent(id!.slice(11))}`
      : sectionPaths[v] + (id ? "/" + encodeURIComponent(id) : "");
    const query = origin ? `?curriculum=${encodeURIComponent(origin)}` : "";
    window.history.pushState(
      null,
      "",
      runtime
        ? `/${path}${query}`
        : `${window.location.pathname}${query}#${path}`,
    );
    acceptedUrl.current = window.location.href;
    window.scrollTo({ top: 0 });
  }
  async function persist(next: Workspace) {
    if (runtime && data) {
      try {
        setData(await runtime.save(data, next));
        setError("");
      } catch (e) {
        if (e instanceof SaveRecoveryError && e.snapshot) setData(e.snapshot);
        setError(navigationGuard.current ? "" : (e as Error).message);
        throw e;
      }
      return;
    }
    try {
      const reconciled = reconcileLearning(data || next, next);
      saveWorkspace(reconciled);
      setData(reconciled);
      setError("");
    } catch {
      const failure = new Error(
        "Your browser could not save this change. Storage may be full or disabled. Your edits remain open.",
      );
      setError(navigationGuard.current ? "" : failure.message);
      throw failure;
    }
  }
  async function login(id: string) {
    if (!(await canLeave())) return;
    sessionStorage.setItem(SESSION, id);
    setUid(id);
    navigate("learn");
  }
  async function logout() {
    if (!(await canLeave())) return;
    if (runtime) {
      if (uid === "guest") runtime.signIn();
      else void runtime.signOut();
      return;
    }
    sessionStorage.removeItem(SESSION);
    setUid(null);
  }
  async function reset() {
    if (!(await canLeave())) return;
    if (
      await confirm(
        "Reset this browser’s sample content, profiles, and progress?",
      )
    ) {
      const next = freshWorkspace();
      await persist(next);
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
              <Button variant="default" onClick={() => runtime.signIn()}>
                Sign in
              </Button>
              <Button variant="ghost" onClick={() => window.location.reload()}>
                Try again
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={reset}>
              Reset demo
            </Button>
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
      <BrandedAccount branding={brandingFromSettings(branding)}>
        <Badge variant="default">INTERACTIVE DEMO</Badge>
        <h1>Explore {branding.name}</h1>
        <p>Choose a demo profile to explore the organization.</p>
        <div className="profile-list">
          {data.users
            .filter((u) => u.active && DEMO_PROFILE_IDS.includes(u.id))
            .sort(
              (a, b) =>
                DEMO_PROFILE_IDS.indexOf(a.id) - DEMO_PROFILE_IDS.indexOf(b.id),
            )
            .map((u) => (
              <NavigationButton
                variant="ghost"
                key={u.id}
                onClick={() => login(u.id)}
              >
                <InitialsAvatar initials={initials(u.name)} />
                <span>
                  <strong>{u.name}</strong>
                  <small>
                    {u.role === "admin"
                      ? "Admin · Organization Admin"
                      : u.role === "manager"
                        ? "Manager · Sales Director"
                        : "User · Account Executive"}
                  </small>
                </span>
                <ArrowRight size={18} />
              </NavigationButton>
            ))}
        </div>
        <div className="demo-note">
          <strong>A working demo, on your terms.</strong>
          <p>
            Changes stay in this browser. Demo profiles are not secure accounts,
            and data is not shared between devices. Use sample content only.
          </p>
        </div>
      </BrandedAccount>
    );
  const visible = (data.publishedContent || data.content).filter(
    (c) => c.status === "published",
  );
  const progress = data.progress[user.id] || [];
  const assigned = assignedCourses(visible, user, data.groups);
  const completed = assigned.filter((c) => isComplete(c, progress)).length;
  const query = search.trim().toLowerCase();
  const results = visible.filter((c) =>
    [c.title, c.summary, c.body, c.category, c.folder]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
  const curriculum =
    view === "learn" && selected?.startsWith("curriculum:")
      ? data.curricula?.find(
          (c) => c.id === selected.slice(11) && c.status === "published",
        )
      : undefined;
  const item = visible.find((c) => c.id === selected);
  const courses = visible.filter((c) => c.kind === "course");
  const docs = visible.filter((c) => c.kind === "doc");
  const currentTitle =
    view === "learn"
      ? "Courses"
      : view === "docs"
        ? "Docs"
        : view === "briefs"
          ? "Updates"
          : view === "team"
            ? "Team progress"
            : "Administration";
  return (
    <div
      className="app"
      style={
        {
          "--brand": branding.accent,
        } as CSSProperties
      }
    >
      <SkipLink
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </SkipLink>
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <Logo name={data.settings?.name} logoUrl={data.settings?.logoUrl} />
        <span className="nav-label">YOUR ORGANIZATION</span>
        <nav>
          {(
            [
              { key: "briefs", title: "Updates", icon: Newspaper },
              { key: "learn", title: "Courses", icon: GraduationCap },
              { key: "docs", title: "Docs", icon: BookOpen },
            ] as const
          ).map((n) => (
            <NavigationButton
              variant="ghost"
              className={view === n.key ? "active" : ""}
              key={n.key}
              onClick={() => navigate(n.key)}
            >
              <n.icon size={19} />
              {n.title}
              {n.key === "learn" && (
                <span className="nav-count">{assigned.length - completed}</span>
              )}
            </NavigationButton>
          ))}
        </nav>
        {view === "docs" && (
          <div className="doc-nav">
            {orderedDocCategories(docs, branding.docCategoryOrder).map(
              (cat) => (
                <details open key={cat}>
                  <summary>{cat}</summary>
                  <DocFolders
                    docs={docs.filter((d) => d.category === cat)}
                    selected={selected}
                    onOpen={(id) => navigate("docs", id)}
                  />
                </details>
              ),
            )}
          </div>
        )}
        <div className="sidebar-bottom">
          {user.role === "admin" && (
            <NavigationButton
              variant="ghost"
              className={"admin-nav " + (view === "admin" ? "active" : "")}
              onClick={() => navigate("admin")}
            >
              <Settings size={18} />
              Manage organization
            </NavigationButton>
          )}
          {(user.role === "manager" ||
            (data.teams || []).some((t) => t.managerId === user.id)) && (
            <NavigationButton
              variant="ghost"
              className={"admin-nav " + (view === "team" ? "active" : "")}
              onClick={() => navigate("team")}
            >
              <GraduationCap size={18} />
              My team’s progress
            </NavigationButton>
          )}
          <AccountButton
            onClick={logout}
            title={
              runtime
                ? uid === "guest"
                  ? "Sign in"
                  : "Sign out"
                : "Switch demo profile"
            }
            initials={initials(user.name)}
            name={
              runtime && uid === "guest" ? "Sign in with Google" : user.name
            }
            description={
              user.role === "admin"
                ? "Administrator"
                : user.role === "manager"
                  ? "Sales Director"
                  : runtime
                    ? uid === "guest"
                      ? "Save progress across devices"
                      : "Learner"
                    : "Account Executive"
            }
            icon={<LogOut size={16} />}
          />
        </div>
      </aside>
      {menu && (
        <Button
          variant="ghost"
          className="fixed inset-0 z-20 rounded-none bg-overlay p-0 hover:bg-overlay md:hidden"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </Button>
          <div className="breadcrumb">
            <span>Organization</span>
            <ChevronRight size={14} />
            <strong>{currentTitle}</strong>
            {item && (
              <>
                <ChevronRight size={14} />
                <span className="crumb-item">{item.title}</span>
              </>
            )}
          </div>
          <Toolbar>
            <SearchField>
              <Input
                aria-label="Search all content"
                placeholder="Search fieldbook…"
                value={search}
                onChange={async (e) => {
                  const next = e.target.value;
                  if (!navigationGuard.current || (await canLeave()))
                    setSearch(next);
                }}
              />
              {search && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <X size={14} />
                </Button>
              )}
            </SearchField>
            {!runtime && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDemo(true)}
              >
                Demo organization
              </Button>
            )}
          </Toolbar>
        </header>
        {error && (
          <Alert variant="destructive" role="alert">
            {error}
          </Alert>
        )}
        <main id="main-content" className="main-content" tabIndex={-1}>
          {query ? (
            <>
              <PageHeading
                eyebrow="FIND YOUR NEXT ANSWER"
                title="Search fieldbook"
                description={`${results.length} results for “${search}”`}
              />
              <div className="result-list">
                {results.map((c) => (
                  <NavigationButton
                    variant="ghost"
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
                          ? "Courses"
                          : c.kind === "doc"
                            ? "Docs"
                            : "Updates"}{" "}
                        / {c.category}
                      </small>
                      <h3>{c.title}</h3>
                      <p>{c.summary}</p>
                    </span>
                    <ArrowUpRight />
                  </NavigationButton>
                ))}
                {!results.length && (
                  <Empty
                    title="No results yet"
                    description="Try a different word or browse the organization."
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
              registerNavigationGuard={(guard) => {
                navigationGuard.current = guard;
              }}
              onReload={async () => {
                const latest = runtime
                  ? runtime.refresh
                    ? await runtime.refresh()
                    : (await runtime.load()).data
                  : loadWorkspace();
                setData(latest);
                setError("");
                return latest;
              }}
            />
          ) : view === "admin" && runtime ? (
            <EmptyState>
              <h2>Administration requires an authorized account.</h2>
              <p>
                Sign in with your administrator account to manage this
                Fieldbook.
              </p>
              <Button variant="default" onClick={runtime.signIn}>
                Sign in with Google
              </Button>
            </EmptyState>
          ) : view === "team" ? (
            <>
              <PageHeading
                eyebrow="GROW TOGETHER"
                title="Team progress"
                description="A shared view of progress and what’s next."
              />
              <TeamProgress data={data} user={user} />
            </>
          ) : curriculum ? (
            <CurriculumPage
              curriculum={curriculum}
              courses={courses}
              progress={progress}
              onBack={() => navigate("learn")}
              onOpen={(id) => navigate("learn", id, curriculum.id)}
            />
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
              onBack={() =>
                navigate(
                  "learn",
                  courseOrigin ? `curriculum:${courseOrigin}` : undefined,
                )
              }
              backLabel={
                courseOrigin ? "Back to curriculum" : "Back to courses"
              }
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
              <Button
                variant="link"
                onClick={() =>
                  navigate(item.kind === "doc" ? "docs" : "briefs")
                }
              >
                ← Back to {item.kind === "doc" ? "docs" : "updates"}
              </Button>
              <span className="eyebrow">{item.category}</span>
              <h1>{item.title}</h1>
              <p className="article-lede">{item.summary}</p>
              <div className="article-meta">
                <InitialsAvatar initials={initials(branding.name)} size="sm" />
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
              curricula={data.curricula || []}
              user={user}
              groups={data.groups}
              assigned={assigned}
              settings={data.settings}
              progress={progress}
              onOpen={(id) => navigate("learn", id)}
              onCurriculum={(id) => navigate("learn", `curriculum:${id}`)}
              onKnowledge={() => navigate("docs")}
              publicLearning={!!runtime && uid === "guest"}
              guest={!!runtime && uid === "guest"}
              onSignIn={runtime?.signIn}
            />
          ) : view === "docs" ? (
            <>
              <PageHeading
                eyebrow="THE KNOWLEDGE THAT GOES WITH YOU"
                title="Docs"
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
                    <span className="text-link">
                      Open the guide <ArrowRight size={17} />
                    </span>
                  </div>
                  <BookOpen size={76} strokeWidth={1} />
                </div>
              )}
              <div className="knowledge-grid">
                {orderedDocCategories(docs, branding.docCategoryOrder).map(
                  (cat) => (
                    <section className="knowledge-section" key={cat}>
                      <BookOpen size={22} />
                      <h2>{cat}</h2>
                      <p>
                        {docs.filter((d) => d.category === cat).length} articles
                      </p>
                      {docs
                        .filter((d) => d.category === cat)
                        .map((d) => (
                          <NavigationButton
                            variant="ghost"
                            onClick={() => navigate("docs", d.id)}
                            key={d.id}
                          >
                            {d.title}
                            <ChevronRight size={16} />
                          </NavigationButton>
                        ))}
                    </section>
                  ),
                )}
              </div>
            </>
          ) : (
            <>
              <PageHeading
                eyebrow="LESS NOISE. MORE SIGNAL."
                title="Updates"
                description="The latest updates, launch briefs, and ideas worth sharing."
              />
              <Updates
                content={visible}
                user={user}
                groups={data.groups}
                guest={!!runtime && uid === "guest"}
                onOpen={(id) => navigate("briefs", id)}
              />
            </>
          )}
          <footer>
            {branding.name} <span>{branding.tagline}</span>
            {privacyHref(branding) && (
              <a href={privacyHref(branding)!}>Privacy policy</a>
            )}
            {!runtime && (
              <Button variant="ghost" onClick={() => setShowDemo(true)}>
                About this demo
              </Button>
            )}
          </footer>
        </main>
      </div>
      <Dialog open={showDemo} onOpenChange={setShowDemo}>
        <DialogContent className="demo-dialog">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3"
            onClick={() => setShowDemo(false)}
            aria-label="Close"
          >
            <X />
          </Button>
          <span className="eyebrow">YOUR DEMO ORGANIZATION</span>
          <DialogTitle>About this demo</DialogTitle>
          <DialogDescription>
            This Next.js demo runs entirely in your browser. Content, profiles,
            assignments, and progress are saved here, on this device.
          </DialogDescription>
          <p>
            Profiles simulate login and roles; they are not secure accounts.
            Don’t enter private information. Nothing is synced to a server.
          </p>
          <ActionGroup>
            <Button variant="outline" onClick={exportData}>
              <Download size={16} />
              Export demo data
            </Button>
            <Button variant="outline" onClick={reset}>
              <RotateCcw size={16} />
              Reset sample data
            </Button>
          </ActionGroup>
        </DialogContent>
      </Dialog>
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
    <PageHeader>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </PageHeader>
  );
}
function Empty({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState>
      <Compass size={28} />
      <h3>{title}</h3>
      <p>{description}</p>
    </EmptyState>
  );
}
export function Course({
  course: c,
  data,
  user,
  onChange,
  onBack,
  backLabel,
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
  backLabel: string;
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
      <Button variant="link" onClick={onBack}>
        ← {backLabel}
      </Button>
      <div className="course-detail-heading">
        <span className="eyebrow">{c.category}</span>
        <h1>{c.title}</h1>
        <p>{c.summary}</p>
        <div className="course-detail-meta">
          <Clock size={16} />
          {c.duration} min <span>·</span>
          {c.lessons.length} lessons<span>·</span>
          {complete ? (
            <Badge variant="success">Completed</Badge>
          ) : (
            "At your own pace"
          )}
        </div>
      </div>
      {runtime && user.id === "guest" && (
        <div className="guest-progress-note">
          Your progress is saved in this browser.{" "}
          <Button variant="link" onClick={runtime.signIn}>
            Sign in to keep it across devices →
          </Button>
        </div>
      )}
      {saveError && (
        <Alert variant="destructive" role="alert">
          {saveError}
        </Alert>
      )}
      <div className="lesson-layout">
        <aside className="lesson-nav">
          <h3>In this course</h3>
          {c.lessons.map((l, i) => (
            <NavigationButton
              variant="ghost"
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
            </NavigationButton>
          ))}
          <NavigationButton
            variant="ghost"
            className={step === c.lessons.length ? "selected" : ""}
            onClick={() => setStep(c.lessons.length)}
          >
            <CheckCircle2 size={18} />
            {c.questions.length ? "Quiz" : "Finish course"}
          </NavigationButton>
          <div className="lesson-progress">
            <Progress
              aria-label="Lessons completed"
              value={
                c.lessons.length
                  ? ((p?.lessons.length || 0) / c.lessons.length) * 100
                  : 0
              }
            />
            <small>
              {p?.lessons.length || 0} of {c.lessons.length} lessons complete
            </small>
          </div>
        </aside>
        <Card className="grid gap-6">
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
                <Alert>
                  This video URL is not supported. Ask an editor to update it.
                </Alert>
              ) : null}
              <div className="markdown">
                <ReactMarkdown>{lesson.body}</ReactMarkdown>
              </div>
              <ActionGroup>
                {p?.lessons.includes(lesson.id) && (
                  <Badge variant="success">
                    <CheckCircle2 size={16} />
                    Lesson completed
                  </Badge>
                )}
                <Button variant="default" onClick={mark} disabled={busy}>
                  {step === c.lessons.length - 1
                    ? "Continue to quiz"
                    : "Complete & continue"}
                  <ArrowRight size={16} />
                </Button>
              </ActionGroup>
            </>
          ) : (
            <>
              <span className="eyebrow">PUT YOUR KNOWLEDGE TO WORK</span>
              <h2>{complete ? "Nicely done." : "A quick quiz."}</h2>
              <p>
                Answer every question correctly to complete the course. You can
                try again as often as you need.
              </p>
              {!allDone && (
                <Alert>
                  Complete all lessons before submitting your answers.
                </Alert>
              )}
              {c.questions.map((q, i) => (
                <FieldGroup className="quiz-question" key={q.id}>
                  <legend>
                    {i + 1}. {q.prompt}
                  </legend>
                  {q.options.map((o, j) => (
                    <Field orientation="horizontal" variant="choice" key={j}>
                      <Radio
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
                    </Field>
                  ))}
                </FieldGroup>
              ))}
              {result && (
                <Alert
                  role="status"
                  variant={resultPassed ? "success" : "default"}
                >
                  {result}
                </Alert>
              )}
              <ActionGroup>
                <Button variant="outline" onClick={() => setStep(0)}>
                  Review lessons
                </Button>
                <Button
                  variant="default"
                  disabled={
                    busy ||
                    !allDone ||
                    c.questions.some((_, i) => answers[i] === undefined)
                  }
                  onClick={submit}
                >
                  {c.questions.length ? "Check answers" : "Complete course"}
                  <Check size={16} />
                </Button>
              </ActionGroup>
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
                <Button variant="link" onClick={onBack}>
                  {backLabel} <ArrowRight size={16} />
                </Button>
              )}
            </>
          )}
        </Card>
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
          <Button
            variant="ghost"
            key={d.id}
            className={selected === d.id ? "selected" : ""}
            onClick={() => onOpen(d.id)}
          >
            {d.title}
          </Button>
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
