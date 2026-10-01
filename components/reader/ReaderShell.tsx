"use client";
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { NavigationGuard } from "@/lib/navigation-guard";
import type { ContentNavigation } from "@/lib/navigation-guard";
import { useNavigationHistory } from "./use-navigation-history";
import { WorkspaceContext } from "./WorkspaceContext";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronRight,
  GraduationCap,
  Menu,
  Newspaper,
} from "lucide-react";
import { WorkspaceFrame } from "@/components/patterns/workspace-frame";
import {
  SidebarHeading,
  sidebarPrimaryLinkClassName,
} from "@/components/patterns/desktop-sidebar";
import { useDesktopSidebar } from "@/components/patterns/desktop-sidebar-state";
import { AccountMenu } from "@/components/patterns/account-menu";
import { NavigationButton } from "@/components/patterns/navigation-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ReaderSearch } from "./ReaderSearch";
import { ReaderGuestImport } from "./ReaderGuestImport";
import type { ReaderShellContext } from "@/lib/reader-types";
import { defaultSettings } from "@/lib/settings";
import { homePath } from "@/lib/navigation";
import { orderedDocs } from "@/lib/docs-navigation";

export function ReaderShell({
  context: initialContext,
  children,
  documentNavigation,
}: {
  context?: ReaderShellContext;
  children: ReactNode;
  documentNavigation?: ReactNode;
}) {
  const [accountError, setAccountError] = useState<string | null>(null);
  const [contextReady, setContextReady] = useState(!!initialContext);
  const [context, setContext] = useState<ReaderShellContext>(initialContext ?? {
    user: null,
    branding: { name: "Fieldbook", accent: defaultSettings.accent, privacyUrl: null },
    docs: [], docCategoryOrder: [], docSections: [],
  });
  const updateContext = useCallback((next: ReaderShellContext) => {
    setContext(next);
    setContextReady(true);
  }, []);
  const guard = useRef<NavigationGuard | null>(null);
  const contentNavigation = useRef<ContentNavigation | null>(null);
  const registerContentNavigation = useCallback((next: ContentNavigation | null) => {
    contentNavigation.current = next;
  }, []);
  const checking = useRef(false);
  const [protectedState, setProtectedState] = useState(false);
  const registerNavigationGuard = useCallback(
    (next: NavigationGuard | null, options?: { protected: boolean }) => {
      guard.current = next;
      setProtectedState(!!next && !!options?.protected);
    },
    [],
  );
  async function canLeave() {
    if (checking.current) return false;
    checking.current = true;
    try {
      return await (guard.current?.() ?? true);
    } finally {
      checking.current = false;
    }
  }
  const { beforeNavigation, finishNavigation } = useNavigationHistory(
    protectedState,
    canLeave,
  );
  const [menu, setMenu] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeTrigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [navigationPending, startNavigation] = useTransition();
  useEffect(() => {
    if (!navigationPending) finishNavigation();
  }, [navigationPending, pathname, finishNavigation]);
  const section = pathname.startsWith("/docs")
    ? "docs"
    : pathname.startsWith("/admin")
      ? "admin"
      : pathname.startsWith("/team")
        ? "team"
        : pathname.startsWith("/curricula")
          ? "curricula"
          : pathname.startsWith("/privacy")
            ? "privacy"
            : pathname.startsWith("/courses")
              ? "courses"
              : "updates";
  const orderedDocList = useMemo(
    () =>
      orderedDocs(context.docs, context.docCategoryOrder, context.docSections),
    [context.docs, context.docCategoryOrder, context.docSections],
  );
  const selected =
    section === "admin" || section === "team" ? null : pathname === "/docs"
      ? orderedDocList[0]?.id || null
      : pathname.split("/")[2] || null;
  const { collapsed, setCollapsed } = useDesktopSidebar(
    section === "courses" && selected ? selected : undefined,
  );
  useEffect(() => {
    if (section !== "docs" || !selected) return;
    const index = orderedDocList.findIndex((doc) => doc.id === selected);
    if (index < 0) return;
    for (const neighbor of [
      orderedDocList[index - 1],
      orderedDocList[index + 1],
    ])
      if (neighbor) router.prefetch(`/docs/${encodeURIComponent(neighbor.id)}`);
  }, [section, selected, orderedDocList, router]);
  const articleTitle = selected
    ? section === "docs"
      ? context.docs.find((doc) => doc.id === selected)?.title
      : section === "curricula"
        ? context.curriculumTitles?.find((item) => item.id === selected)?.title
        : section === "courses"
          ? context.courseTitles?.find((item) => item.id === selected)?.title
          : context.updateTitles?.find((item) => item.id === selected)?.title
    : undefined;
  useEffect(() => {
    if (!menu) return;
    closeTrigger.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [menu]);
  const title =
    section === "docs"
      ? "Docs"
      : section === "courses" || section === "curricula"
        ? "Courses"
        : section === "team"
          ? "Team progress"
          : section === "admin"
            ? "Administration"
            : section === "privacy"
              ? "Privacy policy"
              : "Updates";
  const close = () => setMenu(false);
  const links = [
    { href: "/updates", title: "Updates", icon: Newspaper },
    { href: "/courses", title: "Courses", icon: GraduationCap },
    { href: "/docs", title: "Docs", icon: BookOpen },
  ];
  async function navigate(href: string) {
    if (href === "/admin" && pathname === "/admin") {
      if (await (contentNavigation.current?.() ?? true)) close();
      return;
    }
    if (href === window.location.pathname + window.location.search + window.location.hash) {
      close();
      return;
    }
    const previousFocus = document.activeElement;
    if (!(await canLeave())) {
      if (previousFocus && !previousFocus.isConnected) {
        if (window.matchMedia("(max-width: 767px)").matches)
          trigger.current?.focus();
        else
          document
            .querySelector<HTMLButtonElement>(
              '.sidebar [aria-label="Account menu"]',
            )
            ?.focus();
      }
      return;
    }
    if (href === "/docs") setCollapsed(false);
    else close();
    startNavigation(async () => {
      if (await beforeNavigation()) startNavigation(() => router.push(href));
    });
  }
  const shell = useMemo(
    () => ({ updateContext, registerNavigationGuard, registerContentNavigation, navigate, presentation: contextReady ? context : null }),
    [updateContext, registerNavigationGuard, registerContentNavigation, pathname, router, context, contextReady],
  );
  async function signOut() {
    if (!(await canLeave())) return;
    setAccountError(null);
    try {
      const response = await fetch("/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Could not sign out. Try again.");
      window.location.replace("/");
    } catch {
      close();
      setAccountError("Could not sign out. Try again.");
    }
  }
  return (
    <WorkspaceContext.Provider value={shell}>
      <WorkspaceFrame
        accent={context.branding.accent}
        collapsed={collapsed}
        menu={menu}
        admin={section === "admin"}
        alert={
          accountError && (
            <Alert variant="destructive" role="alert">
              {accountError}
            </Alert>
          )
        }
        onDismiss={close}
        onClickCapture={(event) => {
          const anchor = (event.target as Element).closest<HTMLAnchorElement>(
            "a[href]",
          );
          if (
            !anchor ||
            event.defaultPrevented ||
            event.button ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            (anchor.target && anchor.target !== "_self") ||
            anchor.hasAttribute("download")
          )
            return;
          const target = new URL(anchor.href);
          if (
            target.origin !== window.location.origin ||
            (target.pathname === window.location.pathname &&
              target.search === window.location.search &&
              !!target.hash) ||
            !/^\/(admin|team|docs|updates|courses|curricula|privacy)(\/|$)/.test(
              target.pathname,
            )
          )
            return;
          // Course lesson controls update their own current URL and player state.
          if (
            section === "courses" &&
            selected &&
            target.pathname === pathname &&
            target.searchParams.has("lesson")
          )
            return;
          event.preventDefault();
          void navigate(target.pathname + target.search + target.hash);
        }}
        sidebar={
          <>
            <SidebarHeading
              closeRef={closeTrigger}
              name={context.branding.name}
              collapsed={collapsed}
              onToggle={() => setCollapsed(!collapsed)}
              onClose={() => {
                close();
                trigger.current?.focus();
              }}
            />
            <nav className="primary-navigation" aria-label="Primary">
              {links.map(({ href, title: label, icon: Icon }) => (
                <NavigationButton
                  asChild
                  key={href}
                  className={`${sidebarPrimaryLinkClassName} ${section === href.slice(1) ? "active" : ""}`}
                >
                  <Link
                    href={href}
                    prefetch
                    aria-label={label}
                    title={collapsed ? label : undefined}
                  >
                    <Icon size={19} />
                    <span className="sidebar-nav-text">{label}</span>
                  </Link>
                </NavigationButton>
              ))}
            </nav>
            {documentNavigation}
            <div className="sidebar-bottom">
              <AccountMenu
                pending={!contextReady}
                name={contextReady ? context.user?.name || "Guest" : "Account"}
                email={context.user?.email}
                guest={!context.user}
                initials={
                  context.user
                    ? context.user.name
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")
                    : "G"
                }
                description={
                  context.user?.role === "admin"
                    ? "Administrator"
                    : context.user?.role === "manager"
                      ? "Manager"
                      : context.user
                        ? "Learner"
                        : undefined
                }
                onManageOrganization={
                  context.user?.role === "admin"
                    ? () => {
                        void navigate("/admin");
                      }
                    : undefined
                }
                onTeamProgress={
                  context.user &&
                  (context.user.role === "manager" || context.user.managesTeam)
                    ? () => {
                        void navigate("/team");
                      }
                    : undefined
                }
                onMenuOpen={() => {
                  if (context.user?.role === "admin" && section !== "admin") router.prefetch("/admin");
                  else if (context.user?.role === "manager")
                    router.prefetch("/team");
                }}
                onManageOrganizationIntent={() => { if (section !== "admin") router.prefetch("/admin"); }}
                onTeamProgressIntent={() => router.prefetch("/team")}
                onSignOut={context.user ? signOut : undefined}
                privacyHref={
                  section === "privacy" ? null : context.branding.privacyUrl
                }
                onPrivacyOpen={close}
                onSignIn={
                  !context.user
                    ? () => window.location.assign("/auth/sign-in")
                    : undefined
                }
                onFeedbackOpen={close}
                onFeedbackClose={() => {
                  if (window.matchMedia("(max-width: 767px)").matches)
                    trigger.current?.focus();
                }}
                onFeedback={async (rating, comment) => {
                  const response = await fetch("/api/feedback", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rating, comment }),
                  });
                  if (!response.ok) {
                    const result = await response.json().catch(() => ({}));
                    throw new Error(
                      result.error || "Could not save feedback. Try again.",
                    );
                  }
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
              ref={trigger}
              aria-expanded={menu}
              aria-label="Open navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </Button>
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <Button asChild variant="link">
                <Link href={homePath(context.branding)} prefetch>
                  Organization
                </Link>
              </Button>
              {section !== "courses" && (
                <>
                  <ChevronRight size={14} />
                  <Button asChild variant="link">
                    <Link
                      href={
                        section === "curricula" ? "/courses" : `/${section}`
                      }
                      prefetch
                    >
                      {title}
                    </Link>
                  </Button>
                </>
              )}
              {selected && (
                <>
                  <ChevronRight size={14} />
                  <span className="crumb-item" aria-current="page">
                    {articleTitle || "Article"}
                  </span>
                </>
              )}
            </nav>
            <ReaderSearch />
          </>
        }
      >
        {context.user && <ReaderGuestImport />}
        {children}
      </WorkspaceFrame>
    </WorkspaceContext.Provider>
  );
}
