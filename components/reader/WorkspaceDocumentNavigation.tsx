"use client";
import { usePathname } from "next/navigation";
import { useWorkspaceShell } from "./WorkspaceContext";
import { DocumentTree } from "../patterns/document-tree";
import { orderedDocs } from "@/lib/docs-navigation";
import type { ReaderShellContext } from "@/lib/reader-types";
export function WorkspaceDocumentNavigation({
  initial,
}: {
  initial: ReaderShellContext;
}) {
  const { presentation, navigate } = useWorkspaceShell();
  const path = usePathname();
  const context = presentation ?? initial;
  if (!path.startsWith("/docs")) return null;
  const selected =
    path.split("/")[2] ||
    orderedDocs(context.docs, context.docCategoryOrder, context.docSections)[0]
      ?.id ||
    null;
  return (
    <DocumentTree
      docs={context.docs}
      order={context.docCategoryOrder}
      sections={context.docSections}
      selected={selected}
      href={(id) => `/docs/${encodeURIComponent(id)}`}
      onNavigate={(id) => {
        void navigate(`/docs/${encodeURIComponent(id)}`);
      }}
      storageKey="fieldbook.documents.production"
    />
  );
}
