"use client";
import { teamHref, teamPersonId } from "@/lib/team-destination";
import { courseLibraryView, courseViewPaths, type LearningView } from "@/lib/course-destination";
import { adminHref, parseAdminDestination } from "@/lib/admin-destination";
import { reconcileDemoPublication } from "@/lib/demo-publication";
import { WorkspaceFrame } from "./patterns/workspace-frame";
import { DocumentTree } from "./patterns/document-tree";
import { DocsEmpty } from "./patterns/docs-empty";
import { Article } from "./patterns/reading";
import { gradeQuiz } from "@/lib/course-quiz";
import { Course } from "./Course";
import { guestRecommendations } from "@/lib/guest-recommendations";
import { ReportAvailability } from "./patterns/csv-export";
import { SearchExperience } from "./SearchExperience";
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
import { canPublish } from "@/lib/permissions";
import { AccountMenu } from "./patterns/account-menu";
import { NavigationButton } from "./patterns/navigation-button";
import { Alert } from "@/components/ui/alert";
import { EmptyState, PageHeader } from "@/components/patterns/layout";
import Updates from "./Updates";
import {
  reviewDeadlines,
  recalculateDeadlines,
} from "@/lib/assignment-episodes";
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
import dynamic from "next/dynamic";
import type {
  LandingNavigation,
  NavigationGuard,
} from "@/lib/navigation-guard";
const Admin = dynamic(() => import("./Admin"));
// Presentation defaults only; browser storage still owns the active workspace.
const { settings: demoPickerSettings, users: demoPickerUsers } = freshWorkspace();
type View = "learn" | "docs" | "briefs" | "admin" | "team";
export default function Fieldbook() {
  const adminLanding = useRef<LandingNavigation | null>(null);
  const teamLanding = useRef<LandingNavigation | null>(null);
  const { confirm } = useInteractionDialog();
  const navigationGuard = useRef<NavigationGuard | null>(null);
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
    [teamPerson, setTeamPerson] = useState<string | undefined>(),
    [learningView, setLearningView] = useState<LearningView>("home"),
    [learningReturn, setLearningReturn] = useState<LearningView>("home"),
    [courseOrigin, setCourseOrigin] = useState<string | undefined>(),
    [selected, setSelected] = useState<string | null>(null),
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
        window.dispatchEvent(new Event("fieldbook:admin-history"));
        const [v, id] = window.location.hash.slice(1).split("?")[0].split("/");
        setTargetLesson(
          new URLSearchParams(window.location.search).get("lesson") ||
            undefined,
        );
        setTeamPerson(teamPersonId("/" + window.location.hash.slice(1).split("?")[0]));
        const libraryView = courseLibraryView("/" + window.location.hash.slice(1).split("?")[0]);
        if (libraryView) setLearningView(libraryView);
        setLearningReturn(courseLibraryView(new URLSearchParams(window.location.search).get("from") || "") || "home");
        const section = resolveSection(v);
        if (section) {
          setView(section);
          setSelected(
            !libraryView && v !== "admin" && id
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
    const landing =
      v === view && !id
        ? v === "admin"
          ? adminLanding.current
          : v === "team"
            ? teamLanding.current
            : null
        : null;
    if (landing?.isCurrent) {
      setMenu(false);
      return true;
    }
    if (!(await canLeave())) return false;
    if (landing) {
      setMenu(false);
      await landing.open();
      return true;
    }
    if (v === "docs" && !id) setCollapsed(false);
    if (v !== "docs" || id) setMenu(false);
    const destinationId = v === "docs" && !id ? firstDoc?.id : id;
    setView(v);
    setSelected(destinationId || null);
    const returnView = view === "learn" && !selected ? learningView : learningReturn;
    setLearningReturn(returnView);
    setCourseOrigin(origin);
    setTargetLesson(lesson);
    const curriculum =
      v === "learn" && destinationId?.startsWith("curriculum:");
    const path = curriculum
      ? `curricula/${encodeURIComponent(destinationId!.slice(11))}`
      : sectionPaths[v] +
        (destinationId ? "/" + encodeURIComponent(destinationId) : "");
    const params = new URLSearchParams();
    if (lesson) params.set("lesson", lesson);
    if (origin) params.set("curriculum", origin);
    if (v === "learn" && destinationId) params.set("from", courseViewPaths[returnView]);
    const query = params.size ? `?${params}` : "";
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}${query}#${path}`,
    );
    acceptedUrl.current = window.location.href;
    document.getElementById("main-content")?.scrollTo({ top: 0 });
    return true;
  }
  async function navigateLibrary(next: LearningView) {
    if (!(await canLeave())) return false;
    setView("learn");
    setSelected(null);
    setLearningView(next);
    setCourseOrigin(undefined);
    setTargetLesson(undefined);
    window.history.pushState(null, "", `${window.location.pathname}#${courseViewPaths[next].slice(1)}`);
    acceptedUrl.current = window.location.href;
    document.getElementById("main-content")?.scrollTo({ top: 0 });
    return true;
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
  const demoGuest =
    data && uid === "guest" && data.settings?.access !== "private"
      ? guestRecommendations({
          ...data,
          content: data.publishedContent || data.content,
        })
      : undefined;
  const user =
    demoGuest?.user || data?.users.find((u) => u.id === uid && u.active);
  const branding = {
    ...defaultSettings,
    ...(data ? data.settings : demoPickerSettings),
  };
  const landingPath = homePath(branding);
  const landingView = resolveSection(landingPath.slice(1)) || "learn";
  const policyHref = privacyHref(branding);
  if (!data || !user)
    return (
      <BrandedAccount branding={brandingFromSettings(branding)}>
        <Badge variant="default">INTERACTIVE DEMO</Badge>
        <h1>Choose a demo profile</h1>
        {!data && error && (
          <>
            <Alert variant="destructive" role="alert">
              {error}
            </Alert>
            <Button variant="ghost" onClick={reset}>
              Reset demo
            </Button>
          </>
        )}
        <div className="profile-list">
          {(data?.users || demoPickerUsers)
            .filter((u) => u.active && DEMO_PROFILE_IDS.includes(u.id))
            .sort(
              (a, b) =>
                DEMO_PROFILE_IDS.indexOf(a.id) - DEMO_PROFILE_IDS.indexOf(b.id),
            )
            .map((u) => (
              <NavigationButton
                variant="ghost"
                key={u.id}
                aria-disabled={!data}
                onClick={data ? () => login(u.id) : undefined}
              >
                <InitialsAvatar initials={initials(u.name)} />
                <span>
                  <strong>{u.name}</strong>
                  <small>
                    {u.role === "admin"
                      ? "Admin · Org Admin"
                      : u.role === "contributor" ? "Contributor" : u.role === "manager"
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
  const learningGroups = demoGuest?.groups || data.groups;
  const visible = (
    demoGuest?.content ||
    data.publishedContent ||
    data.content
  ).filter((c) => c.status === "published");
  const progress = data.progress[user.id] || [];
  const assigned = assignedCourses(visible, user, learningGroups);
  const completed = assigned.filter((c) => isComplete(c, progress)).length;
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
            : user.role === "contributor" ? "Publishing" : "Administration";
  return (
    <WorkspaceFrame
      accent={branding.accent}
      collapsed={collapsed}
      menu={menu}
      pending={false}
      admin={view === "admin" && canPublish(user)}
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
                  : user.role === "contributor" ? "Contributor" : user.role === "manager"
                    ? "Sales Director"
                    : "Account Executive"
              }
              onManageOrganization={
                user.role === "admin" ? () => navigate("admin") : undefined
              }
              onManageContent={user.role === "contributor" ? () => navigate("admin") : undefined}
              onTeamProgress={
                user.role === "manager" ||
                (data.teams || []).some((t) => t.managerId === user.id)
                  ? () => navigate("team")
                  : undefined
              }
              onSwitchDemoProfile={logout}
              privacyHref={policyHref}
              externalLinks={branding.externalLinks}
              onPrivacyOpen={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                void (async () => {
                  if (await canLeave()) {
                    setMenu(false);
                    window.location.assign(policyHref!);
                  }
                })();
              }}
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
          <SearchExperience
            key={`${user.id}:${data.settings?.askAi?.enabled ?? true}`}
            id="global-search-results"
            content={data.publishedContent || data.content}
            aiMode={data.settings?.askAi?.enabled === false ? "off" : "demo"}
            onOpen={async (r) => {
              return navigate(
                r.kind === "course" ? "learn" : r.kind === "doc" ? "docs" : "briefs",
                r.contentId,
                undefined,
                r.lessonId || undefined,
              );
            }}
          />
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
      {view === "admin" && canPublish(user) ? (
        <ReportAvailability.Provider value={reportIssue}>
          <Admin
            data={data}
            user={user}
            initialDestination={
              parseAdminDestination("/" + window.location.hash.slice(1)) || {
                tab: "content",
              }
            }
            onWriteDestination={async (destination, replace) => {
              window.history[replace ? "replaceState" : "pushState"](
                null,
                "",
                `${window.location.pathname}#${adminHref(destination).slice(1)}`,
              );
              acceptedUrl.current = window.location.href;
              return true;
            }}
            onChange={persist}
            onReviewDeadlines={async (token) => {
              const current = loadWorkspace();
              const review = reviewDeadlines(current);
              if (token) { const next = recalculateDeadlines(current, token); saveWorkspace(next); setData(next); }
              return review;
            }}
            onSaveContent={async (content, intent) => {
              try {
                const before = loadWorkspace();
                const previous = before.content.find(
                  (item) => item.id === content.id,
                );
                if ((previous?.revision || 0) !== (content.revision || 0))
                  throw new Error(
                    "This content changed in another tab. Reload and review the saved copy before saving again.",
                  );
                const stamp = new Date().toISOString();
                const next = reconcileLearning(
                  before,
                  reconcileDemoPublication(before, {
                    ...before,
                    content: [
                      ...before.content.filter(
                        (item) => item.id !== content.id,
                      ),
                      {
                        ...content,
                        status: intent,
                        updatedAt: stamp,
                        createdAt:
                          previous?.createdAt ||
                          previous?.updatedAt ||
                          content.createdAt ||
                          stamp,
                      },
                    ],
                  }),
                );
                saveWorkspace(next);
                setData(next);
                setReportIssue(undefined);
                return next.content.find((item) => item.id === content.id)!;
              } catch (failure) {
                setReportIssue(
                  "Reload the report before exporting after a failed change.",
                );
                throw failure instanceof Error
                  ? failure
                  : new Error(
                      "Your browser could not save this change. Your edits remain open.",
                    );
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
            registerLandingNavigation={(navigation) => {
              adminLanding.current = navigation;
            }}
            onReload={async () => {
              const latest = loadWorkspace();
              setData(latest);
              setReportIssue(undefined);
              setError("");
              return latest;
            }}
            onLoadPublished={async (id) => {
              const latest = loadWorkspace();
              const draft = latest.content.find((item) => item.id === id);
              const published = latest.publishedContent?.find(
                (item) => item.id === id,
              );
              if (!draft || !published)
                throw new Error(
                  "The published version is unavailable. Your changes remain open.",
                );
              return {
                ...published,
                revision: draft.revision,
                publishedRevision: draft.publishedRevision,
              };
            }}
          />
        </ReportAvailability.Provider>
      ) : view === "team" ? (
        <>
          <PageHeading title="Team progress" />
          <ReportAvailability.Provider value={reportIssue}>
            <TeamProgress
              initialPerson={teamPerson}
              onDestinationChange={async (id) => {
                if (!(await canLeave())) return false;
                setTeamPerson(id);
                window.history.pushState(null, "", `${window.location.pathname}#${teamHref(id).slice(1)}`);
                acceptedUrl.current = window.location.href;
                return true;
              }}
              data={data}
              user={user}
              registerLandingNavigation={(navigation) => {
                teamLanding.current = navigation;
              }}
            />
          </ReportAvailability.Provider>
        </>
      ) : curriculum ? (
        <CurriculumPage
          curriculum={curriculum}
          settings={data.settings}
          courses={courses}
          progress={progress}
          onBack={() => navigateLibrary(learningReturn)}
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
          onBack={() => courseOrigin ? navigate("learn", `curriculum:${courseOrigin}`) : navigateLibrary(learningReturn)}
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
          view={learningView}
          onViewChange={(next) => { void navigateLibrary(next); }}
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
            teams={uid === "guest" ? [] : data.teams}
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
