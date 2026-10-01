"use client";
import { TablePending, FormPending, contentColumns, progressColumns } from "@/components/patterns/panel-pending";
import Link from "next/link";
import { useRef, useState } from "react";
import { Menu, BookOpen } from "lucide-react";
import { WorkspaceFrame } from "@/components/patterns/workspace-frame";
import { SidebarHeading } from "@/components/patterns/desktop-sidebar";
import { NavigationButton } from "@/components/patterns/navigation-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { AccountMenu } from "@/components/patterns/account-menu";

export default function Page() {
  const notify = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <WorkspaceFrame
      accent="#333333"
      collapsed={collapsed}
      menu={menu}
      onDismiss={() => setMenu(false)}
      sidebar={
        <>
          <SidebarHeading
            name="Sample installation"
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
            onClose={() => {
              setMenu(false);
              trigger.current?.focus();
            }}
          />
          <nav aria-label="Primary">
            <NavigationButton asChild>
              <Link href="/ui">
                <BookOpen size={19} />
                <span className="sidebar-nav-text">Interface reference</span>
              </Link>
            </NavigationButton>
          </nav>
          <div className="sidebar-bottom">
            <AccountMenu
              name="Sample learner"
              initials="SL"
              guest
              onFeedback={async () => notify("Example feedback action.")}
            />
          </div>
        </>
      }
      header={
        <>
          <Button
            ref={trigger}
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </Button>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Button asChild variant="link">
              <Link href="/ui">Interface reference</Link>
            </Button>
          </nav>
          <Input aria-label="Search example" placeholder="Search example…" />
        </>
      }
    >
      <div className="grid gap-6">
        <h1>Workspace frame</h1>
        <p>
          The installed app and browser demo share this frame. The sidebar and
          page own their scrolling; the header stays in flow.
        </p>
        <Card>
          <h2>Pending content within a stable shell</h2>
          <p>Real navigation and controls stay in place; only pending data uses these shared, motion-free patterns.</p>
          <TablePending layout="contentSelection" columns={contentColumns} label="Retrieving content" />
          <TablePending layout="progress" columns={progressColumns} label="Retrieving team progress" summary />
          <FormPending label="Retrieving settings" />
        </Card>
        {Array.from({ length: 12 }, (_, index) => (
          <Card key={index}>
            <h2>Example section {index + 1}</h2>
            <p>
              Sample long-page content for reviewing header offsets, sidebar
              controls, focus and narrow layouts.
            </p>
          </Card>
        ))}
      </div>
    </WorkspaceFrame>
  );
}
