"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronRight,
  GraduationCap,
  Menu,
  Newspaper,
  X,
} from "lucide-react";
import { AppBar } from "@/components/patterns/app-bar";
import { InstallationIdentity } from "@/components/patterns/installation-identity";
import { DocumentTree } from "@/components/patterns/document-tree";
import { AccountMenu } from "@/components/patterns/account-menu";
import { SkipLink } from "@/components/patterns/skip-link";
import { NavigationButton } from "@/components/patterns/navigation-button";
import { Button } from "@/components/ui/button";
import { ReaderSearch } from "./ReaderSearch";
import { ReaderGuestImport } from "./ReaderGuestImport";
import type { ReaderShellContext } from "@/lib/reader-types";
import { organizationHomePath } from "@/lib/navigation";
import { orderedDocs } from "@/lib/docs-navigation";

export function ReaderShell({
  context,
  children,
}: {
  context: ReaderShellContext;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [navigationPending, startNavigation] = useTransition();
  const section = pathname.startsWith("/docs")
    ? "docs"
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
  useEffect(() => {
    if (section !== "docs" || !selected) return;
    const index = orderedDocList.findIndex((doc) => doc.id === selected);
    if (index < 0) return;
    for (const neighbor of [orderedDocList[index - 1], orderedDocList[index + 1]])
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
          : section === "privacy"
            ? "Privacy policy"
            : "Updates";
  const close = () => setMenu(false);
  const links = [
    { href: "/updates", title: "Updates", icon: Newspaper },
    { href: "/courses", title: "Courses", icon: GraduationCap },
    { href: "/docs", title: "Docs", icon: BookOpen },
  ];
  async function signOut() {
    await fetch("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    window.location.assign("/auth/sign-in");
  }
  return (
    <div
      className="app"
      style={{ "--brand": context.branding.accent } as CSSProperties}
    >
      <SkipLink href="#main-content">Skip to content</SkipLink>
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <InstallationIdentity name={context.branding.name} />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Close navigation"
            onClick={() => {
              close();
              trigger.current?.focus();
            }}
          >
            <X />
          </Button>
        </div>
        <nav className="primary-navigation" aria-label="Primary">
          {links.map(({ href, title: label, icon: Icon }) => (
            <NavigationButton
              asChild
              key={href}
              className={section === href.slice(1) ? "active" : ""}
            >
              <Link
                href={href}
                prefetch
                onClick={(event) => {
                  if (href !== "/docs") {
                    close();
                    return;
                  }
                  if (
                    event.button ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  startNavigation(() => router.push("/docs"));
                }}
              >
                <Icon size={19} />
                {label}
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
              close();
              startNavigation(() =>
                router.push(`/docs/${encodeURIComponent(id)}`),
              );
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
                    close();
                    startNavigation(() => router.push("/admin"));
                  }
                : undefined
            }
            onTeamProgress={
              context.user &&
              (context.user.role === "manager" || context.user.managesTeam)
                ? () => {
                    close();
                    startNavigation(() => router.push("/team"));
                  }
                : undefined
            }
            onMenuOpen={() => {
              if (context.user?.role === "admin") router.prefetch("/admin");
              else if (context.user?.role === "manager")
                router.prefetch("/team");
            }}
            onManageOrganizationIntent={() => router.prefetch("/admin")}
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
      </aside>
      {menu && (
        <Button
          variant="ghost"
          className="fixed inset-0 z-20 h-full w-full rounded-none bg-overlay p-0 hover:bg-overlay md:hidden"
          aria-label="Dismiss navigation"
          tabIndex={-1}
          onClick={close}
        />
      )}
      <div className="main-shell">
        <AppBar pending={navigationPending}>
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
              <Link href={organizationHomePath} prefetch>
                Organization
              </Link>
            </Button>
            {section !== "courses" && (
              <>
                <ChevronRight size={14} />
                <Button asChild variant="link">
                  <Link
                    href={section === "curricula" ? "/courses" : `/${section}`}
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
        </AppBar>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {context.user && <ReaderGuestImport />}
          {children}
        </main>
      </div>
    </div>
  );
}
