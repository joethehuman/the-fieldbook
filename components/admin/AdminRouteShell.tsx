"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AdminContentShell } from "./AdminContentShell";
import { AdminNavigation } from "./AdminNavigation";
import { Tabs, TabsContent } from "../ui/tabs";
import { useWorkspaceShell } from "../reader/WorkspaceContext";
import { prepareAdminCode } from "./section-code";

export function AdminRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tab = pathname.split("/")[2] || "content";
  const { navigate } = useWorkspaceShell();
  const [requested, setRequested] = useState<string | null>(null);
  const selection = useRef(0);
  useEffect(() => {
    selection.current++;
    setRequested(null);
  }, [pathname]);
  function intent(next: string) {
    void prepareAdminCode(next).catch(() => {});
  }
  async function select(next: string) {
    const href = next === "content" ? "/admin" : `/admin/${next}`;
    if (href === pathname) return;
    const request = ++selection.current;
    setRequested(next);
    try {
      intent(next);
      // Start the route read alongside code preparation. Next retains the old
      // panel or its local boundary; do not serialize data behind a chunk fetch.
      if (request === selection.current) await navigate(href);
    } finally {
      if (request === selection.current) setRequested(null);
    }
  }
  return (
    <div className="admin-workspace">
      <h1 className="sr-only">Administration</h1>
      <Tabs
        className="admin-layout"
        orientation="vertical"
        activationMode="manual"
        value={tab}
        onValueChange={select}
      >
        <AdminNavigation
          production
          tab={tab}
          onValueChange={select}
          onIntent={intent}
        />
        <TabsContent
          value={tab}
          forceMount
          className="admin-panel mt-0"
          aria-busy={!!requested}
        >
          <AdminContentShell active={tab === "content"}>
            {children}
          </AdminContentShell>
        </TabsContent>
      </Tabs>
    </div>
  );
}
