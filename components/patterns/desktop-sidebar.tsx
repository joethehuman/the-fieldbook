"use client";

import { useEffect, useState, type Ref } from "react";
import { PanelLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { InstallationIdentity } from "./installation-identity";

export function useDesktopSidebar(courseKey?: string) {
  const [collapsed, setCollapsed] = useState(Boolean(courseKey));

  useEffect(() => {
    if (courseKey) setCollapsed(true);
  }, [courseKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey &&
        event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "s" &&
        window.matchMedia("(min-width: 48rem)").matches
      ) {
        event.preventDefault();
        setCollapsed((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return { collapsed, setCollapsed };
}

export function SidebarHeading({
  name,
  collapsed,
  onToggle,
  onClose,
  closeRef,
}: {
  name?: string;
  collapsed: boolean;
  onToggle: () => void;
  onClose: () => void;
  closeRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="sidebar-heading">
      <InstallationIdentity name={name} />
      <Tooltip content="Toggle sidebar  ⇧⌘S">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="sidebar-toggle max-md:hidden"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-keyshortcuts="Meta+Shift+S"
          aria-controls="main-sidebar"
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          <PanelLeft aria-hidden="true" />
        </Button>
      </Tooltip>
      <Button
        ref={closeRef}
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Close navigation"
        onClick={onClose}
      >
        <X />
      </Button>
    </div>
  );
}
