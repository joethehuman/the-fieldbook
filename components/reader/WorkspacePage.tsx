import type { ReactNode } from "react";
import type { ReaderShellContext } from "@/lib/reader-types";
import { readerShellContext } from "@server/reader";
import { WorkspaceContextSync } from "./WorkspaceContext";

// Leaf pages refresh presentation after their independently authorized data reads.
export async function WorkspacePage({
  section,
  children,
  context,
}: {
  section: string;
  children: ReactNode;
  context?: ReaderShellContext;
}) {
  return (
    <>
      <WorkspaceContextSync
        context={context ?? (await readerShellContext(section))}
      />
      {children}
    </>
  );
}
