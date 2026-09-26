import { BookOpen } from "lucide-react";
import { EmptyState, PageHeader } from "./layout";

export function DocsEmpty() {
  return (
    <>
      <PageHeader>
        <h1>Docs</h1>
      </PageHeader>
      <EmptyState>
        <BookOpen size={28} aria-hidden="true" />
        <h2>No docs yet</h2>
        <p>Check back later.</p>
      </EmptyState>
    </>
  );
}
