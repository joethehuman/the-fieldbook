import type { ReactNode, MouseEventHandler } from "react";
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
  nativeOverscroll = false,
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
  nativeOverscroll?: boolean;
  onDismiss: () => void;
  onClickCapture?: MouseEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      className={`app ${collapsed ? "sidebar-collapsed" : ""}`}
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
        className={`sidebar ${menu ? "open" : ""} ${pending ? "navigation-pending" : ""}`}
      >
        {sidebar}
      </aside>
      {menu && (
        <Button
          variant="ghost"
          className="fixed inset-0 z-20 h-full w-full rounded-none bg-overlay p-0 hover:bg-overlay md:hidden"
          aria-label="Dismiss navigation"
          tabIndex={-1}
          onClick={onDismiss}
        />
      )}
      <div className="main-shell">
        <AppBar pending={pending}>{header}</AppBar>
        {alert}
        <main
          id="main-content"
          className={`main-content${admin ? " admin-content" : ""}`}
          data-native-overscroll={(nativeOverscroll && !admin) || undefined}
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
      {overlays}
    </div>
  );
}
