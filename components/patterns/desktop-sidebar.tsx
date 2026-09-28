"use client";

import { type Ref } from "react";
import { PanelLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { InstallationIdentity } from "./installation-identity";

export const sidebarPrimaryLinkClassName =
  "sidebar-primary-link w-[var(--sidebar-nav-width)] overflow-hidden whitespace-nowrap px-[9px] transition-[width,background-color,color] duration-[180ms]";

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
          className="sidebar-toggle max-md:hidden transition-[transform,background-color,color] duration-[180ms]"
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
