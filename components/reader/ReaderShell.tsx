"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChevronRight,
  GraduationCap,
  LogOut,
  Menu,
  Newspaper,
  Settings,
  X,
} from "lucide-react";
import { AppBar } from "@/components/patterns/app-bar";
import { InstallationIdentity } from "@/components/patterns/installation-identity";
import { DocumentTree } from "@/components/patterns/document-tree";
import { AccountButton } from "@/components/patterns/account-button";
import { SkipLink } from "@/components/patterns/skip-link";
import { NavigationButton } from "@/components/patterns/navigation-button";
import { Button } from "@/components/ui/button";
import { ReaderSearch } from "./ReaderSearch";
import type { ReaderShellContext } from "@/lib/reader-types";

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
  const section = pathname.startsWith("/docs") ? "docs" : "updates";
  const selected = pathname.split("/")[2] || null;
  const articleTitle = selected
    ? section === "docs"
      ? context.docs.find((doc) => doc.id === selected)?.title
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
  const title = section === "docs" ? "Docs" : "Updates";
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
          <InstallationIdentity
            name={context.branding.name}
            logoUrl={context.branding.logoUrl}
          />
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
        <span className="nav-label">YOUR ORGANIZATION</span>
        <nav className="primary-navigation" aria-label="Primary">
          {links.map(({ href, title: label, icon: Icon }) => (
            <NavigationButton
              asChild
              key={href}
              className={section === href.slice(1) ? "active" : ""}
            >
              <Link
                href={href}
                prefetch={href === "/updates" || href === "/docs"}
                onClick={close}
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
            storageKey="fieldbook.documents.production"
          />
        )}
        <div className="sidebar-bottom">
          {context.user?.role === "admin" && (
            <NavigationButton asChild className="admin-nav">
              <Link href="/admin" prefetch={false}>
                <Settings size={18} />
                Manage organization
              </Link>
            </NavigationButton>
          )}
          {context.user?.role === "manager" && (
            <NavigationButton asChild className="admin-nav">
              <Link href="/team" prefetch={false}>
                <GraduationCap size={18} />
                My team’s progress
              </Link>
            </NavigationButton>
          )}
          <AccountButton
            name={context.user?.name || "Sign in with Google"}
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
                : context.user
                  ? "Learner"
                  : "Save progress across devices"
            }
            icon={<LogOut size={16} />}
            actionLabel={context.user ? "Sign out" : "Sign in"}
            onClick={
              context.user
                ? signOut
                : () => window.location.assign("/auth/sign-in")
            }
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
        <AppBar>
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
              <Link href="/courses" prefetch={false}>
                Organization
              </Link>
            </Button>
            <ChevronRight size={14} />
            <Button asChild variant="link">
              <Link href={`/${section}`} prefetch>
                {title}
              </Link>
            </Button>
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
          {children}
          <footer>
            {context.branding.name} <span>{context.branding.tagline}</span>
            {context.branding.privacyUrl && (
              <Link href={context.branding.privacyUrl}>Privacy policy</Link>
            )}
          </footer>
        </main>
      </div>
    </div>
  );
}
