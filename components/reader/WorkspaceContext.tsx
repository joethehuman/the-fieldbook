"use client";
import { createContext, useContext, useLayoutEffect } from "react";
import type { ReaderShellContext } from "@/lib/reader-types";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";

export const WorkspaceContext = createContext<{
  updateContext: (context: ReaderShellContext) => void;
  registerNavigationGuard: RegisterNavigationGuard;
} | null>(null);
export function useWorkspaceShell() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace shell is required");
  return context;
}
// Presentation data only. Server pages, metadata and APIs independently authorize every read.
export function WorkspaceContextSync({
  context,
}: {
  context: ReaderShellContext;
}) {
  const { updateContext } = useWorkspaceShell();
  useLayoutEffect(() => updateContext(context), [context, updateContext]);
  return null;
}
