"use client";
import { AdminNavigation } from "./AdminNavigation";
import { Tabs, TabsContent } from "../ui/tabs";
import { SectionHeader } from "../patterns/layout";
import { ContentPending } from "../patterns/content-pending";

export function AdminLoading({ production = true }: { production?: boolean }) {
  return (
    <div className="admin-workspace" aria-busy="true">
      <h1 className="sr-only">Administration</h1>
      <Tabs className="admin-layout" orientation="vertical" value="content">
        <AdminNavigation
          tab="content"
          production={production}
          disabled
          onValueChange={() => {}}
        />
        <TabsContent value="content" className="admin-panel mt-0">
          <SectionHeader
            variant="page"
            title={<h2>Content</h2>}
            description="Create and maintain courses, docs, and updates."
          />
          <ContentPending label="Loading administration content" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
