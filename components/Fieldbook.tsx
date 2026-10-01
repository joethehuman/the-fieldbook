"use client";
import { reconcileDemoPublication } from "@/lib/demo-publication";
import { WorkspaceFrame } from "./patterns/workspace-frame";
import { DocumentTree } from "./patterns/document-tree";
import { DocsEmpty } from "./patterns/docs-empty";
import { Article } from "./patterns/reading";
import { gradeQuiz } from "@/lib/course-quiz";
import { Course } from "./Course";
import { guestRecommendations } from "@/lib/guest-recommendations";
import { ReportAvailability } from "./patterns/csv-export";
import { SearchPanel } from "./patterns/search-panel";
import { ContentSearch } from "./ContentSearch";
import { InitialsAvatar } from "./ui/initials-avatar";
import { BrandedAccount } from "./patterns/branded-account";
import {
  SidebarHeading,
  sidebarPrimaryLinkClassName,
} from "./patterns/desktop-sidebar";
import { useDesktopSidebar } from "./patterns/desktop-sidebar-state";
import { brandingFromSettings } from "@/lib/branding";
import { CurriculumPage } from "./CurriculumPage";
import { Badge } from "@/components/ui/badge";
import { AccountMenu } from "./patterns/account-menu";
import { SearchField } from "./patterns/search-field";
import { NavigationButton } from "./patterns/navigation-button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Toolbar, EmptyState, PageHeader } from "@/components/patterns/layout";
import Updates from "./Updates";
import { reconcileLearning } from "@/lib/learning-groups";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  GraduationCap,
  Newspaper,
  ArrowRight,
  ChevronRight,
  X,
  Menu,
  Compass,
  Download,
  RotateCcw,
} from "lucide-react";
import { applyDemoBulk } from "@/lib/bulk-actions";
import { sectionPaths, resolveSection, homePath } from "@/lib/navigation";
import { orderedDocs } from "@/lib/docs-navigation";
import { defaultSettings, privacyHref } from "@/lib/settings";
import Learning from "./Learning";
import Feedback from "./Feedback";
import { TeamProgress } from "./Teams";
import { assignedCourses, isComplete, type Content } from "@/lib/types";
import {
  freshWorkspace,
  loadWorkspace,
  saveWorkspace,
  updateProgress,
  SESSION,
  DEMO_PROFILE_IDS,
  type Workspace,
} from "@/lib/store";
import Admin from "./Admin";
import type { NavigationGuard } from "@/lib/navigation-guard";
import type { ContentNavigation } from "@/lib/navigation-guard";
type View = "learn" | "docs" | "briefs" | "admin" | "team";
export default function Fieldbook() {
  const { confirm } = useInteractionDialog();
  const navigationGuard = useRef<NavigationGuard | null>(null);
  const contentNavigation = useRef<ContentNavigation | null>(null);
  const acceptedUrl = useRef("");
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const demoTrigger = useRef<HTMLButtonElement>(null);
  const menuClose = useRef<HTMLButtonElement>(null);
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
    [courseOrigin, setCourseOrigin] = useState<string | undefined>(),
    [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [targetLesson, setTargetLesson] = useState<string | undefined>(),
    [error, setError] = useState(""),
    [reportIssue, setReportIssue] = useState<string | undefined>(),
    [menu, setMenu] = useState(false),
    [showDemo, setShowDemo] = useState(false);
  const { collapsed, setCollapsed } = useDesktopSidebar(
    view === "learn" && selected && !selected.startsWith("curriculum:")
      ? selected
      : undefined,
  );
  useEffect(() => {
    try {
      const workspace = loadWorkspace();
      setData(workspace);
      if (!window.location.hash)
        setView(
          resolveSection(homePath(workspace.settings).slice(1)) || "learn",
        );
      const savedProfile = sessionStorage.getItem(SESSION);
      setUid(
        savedProfile &&
          (DEMO_PROFILE_IDS.includes(savedProfile) || savedProfile === "guest")
          ? savedProfile
          : null,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (!menu) return;
    menuClose.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(false);
        menuTrigger.current?.focus();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [menu]);
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
        const [v, id] = window.location.hash.slice(1).split("?")[0].split("/");
        setTargetLesson(
          new URLSearchParams(window.location.search).get("lesson") ||
            undefined,
        );
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
  async function navigate(
    v: View,
    id?: string,
    origin?: string,
    lesson?: string,
  ) {
    if (v === "admin" && view === "admin") {
      if (await (contentNavigation.current?.() ?? true)) setMenu(false);
      return;
    }
    if (!(await canLeave())) return;
    if (v === "docs" && !id) setCollapsed(false);
    if (v !== "docs" || id) setMenu(false);
    const destinationId = v === "docs" && !id ? firstDoc?.id : id;
    setView(v);
    setSelected(destinationId || null);
    setCourseOrigin(origin);
    setTargetLesson(lesson);
    setSearch("");
    const curriculum =
      v === "learn" && destinationId?.startsWith("curriculum:");
    const path = curriculum
      ? `curricula/${encodeURIComponent(destinationId!.slice(11))}`
      : sectionPaths[v] +
        (destinationId ? "/" + encodeURIComponent(destinationId) : "");
    const query = lesson
      ? `?lesson=${encodeURIComponent(lesson)}`
      : origin
        ? `?curriculum=${encodeURIComponent(origin)}`
        : "";
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}${query}#${path}`,
    );
    acceptedUrl.current = window.location.href;
    document.getElementById("main-content")?.scrollTo({ top: 0 });
  }
  async function persist(
    next: Workspace,
    options?: { locallyHandled?: boolean },
  ) {
    setError("");
    setReportIssue("Updating report…");
    try {
      const reconciled = reconcileLearning(
        data || next,
        reconcileDemoPublication(data || next, next),
      );
      saveWorkspace(reconciled);
      setData(reconciled);
      setReportIssue(undefined);
      setError("");
    } catch {
      setReportIssue(
        "Reload the report before exporting after a failed change.",
      );
      const failure = new Error(
        "Your browser could not save this change. Storage may be full or disabled. Your edits remain open.",
      );
      if (!options?.locallyHandled)
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
  if (!data) return <DemoProfilePicker data={freshWorkspace()} error={error} onReset={reset} />;
  const demoGuest =
    uid === "guest" && data.settings?.access !== "private"
      ? guestRecommendations({
          ...data,
          content: data.publishedContent || data.content,
        })
      : undefined;
  const user =
    demoGuest?.user || data.users.find((u) => u.id === uid && u.active);
  const learningGroups = demoGuest?.groups || data.groups;
  const branding = { ...defaultSettings, ...data.settings };
  const landingPath = homePath(branding);
  const landingView = resolveSection(landingPath.slice(1)) || "learn";
  const policyHref = privacyHref(branding);
  if (!user) return <DemoProfilePicker data={data} onLogin={login} />;
  const visible = (
    demoGuest?.content ||
    data.publishedContent ||
    data.content
  ).filter((c) => c.status === "published");
  const progress = data.progress[user.id] || [];
  const assigned = assignedCourses(visible, user, learningGroups);
  const completed = assigned.filter((c) => isComplete(c, progress)).length;
  const query = search.trim().toLowerCase();
  const curriculum =
    view === "learn" && selected?.startsWith("curriculum:")
      ? data.curricula?.find(
          (c) => c.id === selected.slice(11) && c.status === "published",
        )
      : undefined;
  const courses = visible.filter((c) => c.kind === "course");
  const docs = visible.filter((c) => c.kind === "doc");
  const firstDoc = orderedDocs(
    docs,
    branding.docCategoryOrder,
    branding.docSections,
  )[0];
  const item = visible.find(
    (c) => c.id === (selected || (view === "docs" ? firstDoc?.id : null)),
  );
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
    <WorkspaceFrame
      accent={branding.accent}
      collapsed={collapsed}
      menu={menu}
      admin={view === "admin" && user.role === "admin"}
      onDismiss={() => setMenu(false)}
      sidebar={
        <>
          <SidebarHeading
            name={data.settings?.name}
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
            onClose={() => {
              setMenu(false);
              menuTrigger.current?.focus();
            }}
            closeRef={menuClose}
          />
          <nav className="primary-navigation" aria-label="Primary">
            {(
              [
                { key: "briefs", title: "Updates", icon: Newspaper },
                { key: "learn", title: "Courses", icon: GraduationCap },
                { key: "docs", title: "Docs", icon: BookOpen },
              ] as const
            ).map((n) => (
              <NavigationButton
                variant="ghost"
                className={`${sidebarPrimaryLinkClassName} ${view === n.key ? "active" : ""}`}
                key={n.key}
                aria-label={n.title}
                title={collapsed ? n.title : undefined}
                onClick={() => void navigate(n.key)}
              >
                <n.icon size={19} />
                <span className="sidebar-nav-text">{n.title}</span>
                {n.key === "learn" && (
                  <span className="nav-count">
                    {assigned.length - completed}
                  </span>
                )}
              </NavigationButton>
            ))}
          </nav>
          {view === "docs" && (
            <DocumentTree
              docs={docs}
              order={branding.docCategoryOrder}
              sections={branding.docSections}
              selected={selected || firstDoc?.id || null}
              href={(id) => `#docs/${encodeURIComponent(id)}`}
              onOpen={(id) => navigate("docs", id)}
              storageKey="fieldbook.documents.demo"
            />
          )}
          <div className="sidebar-bottom">
            <AccountMenu
              initials={initials(user.name)}
              name={user.name}
              email={uid === "guest" ? undefined : user.email}
              guest={uid === "guest"}
              description={
                user.role === "admin"
                  ? "Administrator"
                  : user.role === "manager"
                    ? "Sales Director"
                    : "Account Executive"
              }
              onManageOrganization={
                user.role === "admin" ? () => navigate("admin") : undefined
              }
              onTeamProgress={
                user.role === "manager" ||
                (data.teams || []).some((t) => t.managerId === user.id)
                  ? () => navigate("team")
                  : undefined
              }
              onSwitchDemoProfile={logout}
              privacyHref={policyHref}
              onPrivacyOpen={() => setMenu(false)}
              onAboutDemo={(trigger) => {
                demoTrigger.current = trigger.current;
                setMenu(false);
                setShowDemo(true);
              }}
              onFeedbackOpen={() => setMenu(false)}
              onFeedbackClose={() => {
                if (window.matchMedia("(max-width: 767px)").matches)
                  menuTrigger.current?.focus();
              }}
              onFeedback={async (rating, comment) => {
                await persist(
                  {
                    ...data,
                    feedback: [
                      ...(data.feedback || []),
                      {
                        id: crypto.randomUUID(),
                        userId: user.id,
                        rating,
                        comment,
                        updatedAt: new Date().toISOString(),
                      },
                    ],
                  },
                  { locallyHandled: true },
                );
              }}
            />
          </div>
        </>
      }
      header={
        <>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            ref={menuTrigger}
            aria-expanded={menu}
            aria-label="Open navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </Button>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Button asChild variant="link">
              <a
                href={`#${landingPath.slice(1)}`}
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  void navigate(landingView);
                }}
              >
                Organization
              </a>
            </Button>
            <ChevronRight size={14} />
            <Button asChild variant="link">
              <a
                href={`#${sectionPaths[view]}`}
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  void navigate(view);
                }}
              >
                {currentTitle}
              </a>
            </Button>
            {item && (
              <>
                <ChevronRight size={14} />
                <span
                  className="crumb-item"
                  aria-current="page"
                  title={item.title}
                >
                  {item.title}
                </span>
              </>
            )}
          </nav>
          <SearchPanel
            id="global-search-results"
            open={!!query && searchOpen}
            onDismiss={() => setSearchOpen(false)}
            trigger={
              <Toolbar>
                <SearchField>
                  <Input
                    aria-label="Search all content"
                    aria-expanded={!!query && searchOpen}
                    aria-controls={
                      query && searchOpen ? "global-search-results" : undefined
                    }
                    onFocus={() => setSearchOpen(true)}
                    maxLength={160}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" && query) setSearchOpen(true);
                      if (e.key === "ArrowDown") {
                        const first = document.querySelector<HTMLAnchorElement>(
                          '[aria-label="Search results"] a',
                        );
                        if (first) {
                          e.preventDefault();
                          first.focus();
                        }
                      }
                    }}
                    placeholder="Search fieldbook…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSearchOpen(true);
                    }}
                  />
                  {search && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Clear search"
                      onClick={() => {
                        setSearch("");
                        document
                          .querySelector<HTMLInputElement>(
                            '[aria-label="Search all content"]',
                          )
                          ?.focus();
                      }}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </SearchField>
              </Toolbar>
            }
          >
            <ContentSearch
              query={search}
              content={data.publishedContent || data.content}
              onOpen={async (r) => {
                await navigate(
                  r.kind === "course"
                    ? "learn"
                    : r.kind === "doc"
                      ? "docs"
                      : "briefs",
                  r.contentId,
                  undefined,
                  r.lessonId || undefined,
                );
              }}
            />
          </SearchPanel>
        </>
      }
      alert={
        error && (
          <Alert variant="destructive" role="alert">
            {error}
          </Alert>
        )
      }
      overlays={
        <>
          <Dialog open={showDemo} onOpenChange={setShowDemo}>
            <DialogContent
              className="demo-dialog"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (window.matchMedia("(max-width: 767px)").matches)
                  menuTrigger.current?.focus();
                else demoTrigger.current?.focus();
              }}
            >
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3"
                onClick={() => setShowDemo(false)}
                aria-label="Close"
              >
                <X />
              </Button>
              <DialogTitle>About this demo</DialogTitle>
              <DialogDescription>
                Changes stay in this browser and are not synced. Demo profiles
                are not secure accounts. Use sample content only.
              </DialogDescription>
              <DialogFooter>
                <Button variant="outline" onClick={exportData}>
                  <Download size={16} />
                  Export demo data
                </Button>
                <Button variant="outline" onClick={reset}>
                  <RotateCcw size={16} />
                  Reset sample data
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      {view === "admin" && user.role === "admin" ? (
        <ReportAvailability.Provider value={reportIssue}>
          <Admin
            registerContentNavigation={(next) => { contentNavigation.current = next; }}
            data={data}
            user={user}
            onChange={persist}
            onSaveContent={async (content, intent) => {
              try {
                const before = loadWorkspace();
                const previous = before.content.find((item) => item.id === content.id);
                if ((previous?.revision || 0) !== (content.revision || 0))
                  throw new Error("This content changed in another tab. Reload and review the saved copy before saving again.");
                const stamp = new Date().toISOString();
                const next = reconcileLearning(before, reconcileDemoPublication(before, {
                  ...before,
                  content: [...before.content.filter((item) => item.id !== content.id), {
                    ...content, status: intent, updatedAt: stamp,
                    createdAt: previous?.createdAt || previous?.updatedAt || content.createdAt || stamp,
                  }],
                }));
                saveWorkspace(next);
                setData(next);
                setReportIssue(undefined);
                return next.content.find((item) => item.id === content.id)!;
              } catch (failure) {
                setReportIssue("Reload the report before exporting after a failed change.");
                throw failure instanceof Error ? failure : new Error("Your browser could not save this change. Your edits remain open.");
              }
            }}
            onBulk={async (action) => {
              const result = applyDemoBulk(data, user, action);
              saveWorkspace(result.data);
              setData(result.data);
              return result.results;
            }}
            registerNavigationGuard={(guard) => {
              navigationGuard.current = guard;
            }}
            onReload={async () => {
              const latest = loadWorkspace();
              setData(latest);
              setReportIssue(undefined);
              setError("");
              return latest;
            }}
          />
        </ReportAvailability.Provider>
      ) : view === "team" ? (
        <>
          <PageHeading title="Team progress" />
          <ReportAvailability.Provider value={reportIssue}>
            <TeamProgress data={data} user={user} />
          </ReportAvailability.Provider>
        </>
      ) : curriculum ? (
        <CurriculumPage
          curriculum={curriculum}
          settings={data.settings}
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
          key={item.id + item.version + (targetLesson || "")}
          course={item}
          initialLessonId={targetLesson || undefined}
          curriculumTitle={
            data.curricula?.find((entry) => entry.id === courseOrigin)?.name
          }
          progress={data.progress[user.id] || []}
          onBack={() =>
            navigate(
              "learn",
              courseOrigin ? `curriculum:${courseOrigin}` : undefined,
            )
          }
          backLabel={courseOrigin ? "Back to curriculum" : "Back to courses"}
          feedback={
            <Feedback
              key={item.id + user.id}
              content={item}
              user={user}
              data={data}
              onChange={persist}
              expanded={!item.questions.length}
            />
          }
          onDemoProgress={(lessonId, answers, complete) => {
            persist(
              updateProgress(data, user.id, item, lessonId, answers, complete),
            );
            return answers ? gradeQuiz(item, answers).passed : undefined;
          }}
        />
      ) : item ? (
        <Article
          key={item.id}
          documents={docs}
          sectionOrder={branding.docCategoryOrder}
          sections={branding.docSections}
          demo
          onDocument={(id) => navigate("docs", id)}
          item={item}
          back={
            item.kind === "doc" ? null : (
              <Button variant="link" onClick={() => navigate("briefs")}>
                ← Back to updates
              </Button>
            )
          }
        >
          <Feedback
            key={item.id + user.id}
            content={item}
            user={user}
            data={data}
            onChange={persist}
          />
        </Article>
      ) : view === "learn" ? (
        <Learning
          key={user.id}
          courses={courses}
          curricula={data.curricula || []}
          user={user}
          groups={learningGroups}
          assigned={assigned}
          settings={data.settings}
          progress={progress}
          onOpen={(id) => navigate("learn", id)}
          onCurriculum={(id) => navigate("learn", `curriculum:${id}`)}
          guest={uid === "guest"}
        />
      ) : view === "docs" ? (
        <DocsEmpty />
      ) : (
        <>
          <PageHeading title="Updates" />
          <Updates
            content={visible}
            settings={data.settings}
            user={user}
            groups={learningGroups}
            onOpen={(id) => navigate("briefs", id)}
          />
        </>
      )}
    </WorkspaceFrame>
  );
}
function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
}
function PageHeading({ title }: { title: string }) {
  return (
    <PageHeader>
      <h1>{title}</h1>
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

function DemoProfilePicker({ data, onLogin, error, onReset }: { data: Workspace; onLogin?: (id: string) => Promise<void>; error?: string; onReset?: () => Promise<void> }) {
  return (
      <BrandedAccount branding={brandingFromSettings({ ...defaultSettings, ...data.settings })}>
        <Badge variant="default">INTERACTIVE DEMO</Badge>
        <h1>Choose a demo profile</h1>
        {error && <Alert variant="destructive" role="alert">{error}<Button variant="ghost" onClick={onReset}>Reset demo</Button></Alert>}
        <div className="profile-list" aria-busy={!onLogin}>
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
                disabled={!onLogin}
                onClick={() => onLogin?.(u.id)}
              >
                <InitialsAvatar initials={initials(u.name)} />
                <span>
                  <strong>{u.name}</strong>
                  <small>
                    {u.role === "admin"
                      ? "Admin · Org Admin"
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
          <p>
            Changes stay in this browser. Demo profiles are not secure accounts,
            and data is not shared between devices. Use sample content only.
          </p>
        </div>
      </BrandedAccount>
    );
}
