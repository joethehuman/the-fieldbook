"use client";

import { useEffect, useRef, useState, type ReactNode, type MouseEventHandler } from "react";
import { useCompactLayout } from "./use-compact-layout";
import { useSidebarMotion } from "./use-sidebar-motion";
import { EditorAppHeaderContext } from "./editor-app-header";
import { EditorMobileScrollContext } from "./use-editor-layout";
import { brandThemeStyle } from "@/lib/brand-theme";
import { BrandThemeSync } from "./brand-theme-sync";
import { SkipLink } from "./skip-link";
import { AppBar } from "./app-bar";
import { Button } from "../ui/button";

// One visual and scroll hierarchy for the installed shell and browser-local demo.
export function WorkspaceFrame({
  accent,
  collapsed,
  menu,
  pending,
  sidebar,
  header,
  children,
  alert,
  overlays,
  admin = false,
  learner = false,
  onDismiss,
  onClickCapture,
}: {
  accent: string;
  collapsed: boolean;
  menu: boolean;
  pending: boolean;
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
  alert?: ReactNode;
  overlays?: ReactNode;
  admin?: boolean;
  learner?: boolean;
  onDismiss: () => void;
  onClickCapture?: MouseEventHandler<HTMLDivElement>;
}) {
  const [editorHeader, setEditorHeader] = useState<HTMLDivElement | null>(null);
  const compact = useCompactLayout();
  const [mobileEditor, setMobileEditor] = useState(false);
  const app = useRef<HTMLDivElement>(null);
  useSidebarMotion(app, collapsed, compact);
  useEffect(() => {
    if (!compact && menu) {
      onDismiss();
      document.getElementById("main-sidebar")?.querySelector<HTMLButtonElement>(".sidebar-toggle")?.focus({ preventScroll: true });
    }
  }, [compact, menu, onDismiss]);
  return (
    <EditorAppHeaderContext.Provider value={editorHeader}>
    <EditorMobileScrollContext.Provider value={setMobileEditor}>
    <div
      ref={app}
      className={`app ${collapsed ? "sidebar-collapsed" : ""}${learner ? " learner-workspace" : ""}${mobileEditor ? " bn-scroll-container" : ""}`}
      data-mobile-editor={mobileEditor || undefined}
      style={brandThemeStyle(accent)}
      onClickCapture={onClickCapture}
    >
      <BrandThemeSync accent={accent} />
      <SkipLink
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </SkipLink>
      <aside
        id="main-sidebar"
        className={`sidebar workspace-chrome ${menu ? "open" : ""} ${pending ? "navigation-pending" : ""}`}
        inert={compact && !menu}
      >
        {sidebar}
      </aside>
      <Button
        variant="ghost"
        className="app-navigation-backdrop fixed inset-0 z-20 h-full w-full rounded-none bg-overlay p-0 hover:bg-overlay active:bg-overlay"
        data-state={menu && compact ? "open" : "closed"}
        aria-label="Dismiss navigation"
        aria-hidden={!menu || !compact}
        inert={!menu || !compact}
        tabIndex={-1}
        onClick={onDismiss}
      />
      <div className="main-shell">
        <AppBar pending={pending}>{header}<div className="app-editor-header" ref={setEditorHeader} /></AppBar>
        <div className="workspace-alerts">{alert}</div>
        <main
          id="main-content"
          className={`main-content${admin ? " admin-content" : ""}`}
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
      {overlays}
    </div>
    </EditorMobileScrollContext.Provider>
    </EditorAppHeaderContext.Provider>
  );
}
