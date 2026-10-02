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
import type { LandingNavigation, NavigationGuard } from "@/lib/navigation-guard";
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
import { DocumentTree } from "@/components/patterns/document-tree";
import { roleLabel } from "@/lib/permissions";
import { AccountMenu } from "@/components/patterns/account-menu";
import { NavigationButton } from "@/components/patterns/navigation-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ReaderSearch } from "./ReaderSearch";
import { ReaderGuestImport } from "./ReaderGuestImport";
import type { ReaderShellContext } from "@/lib/reader-types";
import { homePath } from "@/lib/navigation";
import { orderedDocs } from "@/lib/docs-navigation";

export function ReaderShell({
  context: initialContext,
  children,
}: {
  context: ReaderShellContext;
  children: ReactNode;
}) {
  const [accountError, setAccountError] = useState<string | null>(null);
  const [context, updateContext] = useState(initialContext);
  const guard = useRef<NavigationGuard | null>(null);
  const landings = useRef<Partial<Record<"admin" | "team", LandingNavigation>>>(
    {},
  );
  const registerLandingNavigation = useCallback(
    (section: "admin" | "team", navigation: LandingNavigation | null) => {
      if (navigation) landings.current[section] = navigation;
      else delete landings.current[section];
    },
    [],
  );
  const checking = useRef(false);
  const [protectedState, setProtectedState] = useState(false);
  const registerNavigationGuard = useCallback(
    (next: NavigationGuard | null, options?: { protected: boolean }) => {
      guard.current = next;
      setProtectedState(!!next && !!options?.protected);
    },
    [],
  );
  const shell = useMemo(
    () => ({ updateContext, registerNavigationGuard, registerLandingNavigation }),
    [registerNavigationGuard, registerLandingNavigation],
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
  const [showNavigationProgress, setShowNavigationProgress] = useState(true);
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
    pathname === "/docs"
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
            ? context.user?.role === "contributor" ? "Publishing" : "Administration"
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
    const sameUrl =
      new URL(href, window.location.href).href === window.location.href;
    const landing =
      href === "/admin"
        ? landings.current.admin
        : href === "/team"
          ? landings.current.team
          : undefined;
    if (sameUrl && (!landing || landing.isCurrent)) {
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
    if (sameUrl && landing) {
      close();
      await landing.open();
      return;
    }
    if (href === "/docs") setCollapsed(false);
    else close();
    setShowNavigationProgress(
      !(
        ["docs", "updates", "courses", "curricula"].includes(section) &&
        /^\/(docs|updates|courses|curricula)(\/|$)/.test(href)
      ),
    );
    startNavigation(async () => {
      if (await beforeNavigation()) startNavigation(() => router.push(href));
    });
  }
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
        pending={navigationPending && showNavigationProgress}
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
            {section === "docs" && (
              <DocumentTree
                docs={context.docs}
                order={context.docCategoryOrder}
                sections={context.docSections}
                selected={selected}
                href={(id) => `/docs/${encodeURIComponent(id)}`}
                onNavigate={(id) => {
                  void navigate(`/docs/${encodeURIComponent(id)}`);
                }}
                storageKey="fieldbook.documents.production"
              />
            )}
            <div className="sidebar-bottom">
              <AccountMenu
                name={context.user?.name || "Guest"}
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
                description={context.user ? roleLabel(context.user.role) : undefined}
                onManageContent={context.user?.role === "contributor" ? () => { void navigate("/admin"); } : undefined}
                onManageContentIntent={() => router.prefetch("/admin")}
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
                  if (["admin", "contributor"].includes(context.user?.role || "")) router.prefetch("/admin");
                  if (context.user?.role !== "admin" && (context.user?.role === "manager" || context.user?.managesTeam))
                    router.prefetch("/team");
                }}
                onManageOrganizationIntent={() => router.prefetch("/admin")}
                onTeamProgressIntent={() => router.prefetch("/team")}
                onSignOut={context.user ? signOut : undefined}
                externalLinks={context.branding.externalLinks}
                privacyHref={
                  section === "privacy" ? null : context.branding.privacyUrl
                }
                onPrivacyOpen={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  if (context.branding.privacyUrl?.startsWith("/")) return;
                  event.preventDefault();
                  void (async () => {
                    if (await canLeave()) {
                      close();
                      window.location.assign(context.branding.privacyUrl!);
                    }
                  })();
                }}
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
            <ReaderSearch
              enabled={context.branding.askAiEnabled === true}
              userId={context.user?.id || null}
              onOpen={async (result) => {
                if (!(await canLeave())) return false;
                beforeNavigation();
                startNavigation(() => router.push(result.href));
                return true;
              }}
            />
          </>
        }
      >
        {context.user && <ReaderGuestImport />}
        {children}
      </WorkspaceFrame>
    </WorkspaceContext.Provider>
  );
}
