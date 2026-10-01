"use client";
import { createContext, useContext, useLayoutEffect } from "react";
import type { ReaderShellContext } from "@/lib/reader-types";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import type { RegisterContentNavigation } from "@/lib/navigation-guard";

export const WorkspaceContext = createContext<{
  presentation: ReaderShellContext | null;
  navigate: (href: string) => Promise<void>;
  updateContext: (context: ReaderShellContext) => void;
  registerNavigationGuard: RegisterNavigationGuard;
  registerContentNavigation: RegisterContentNavigation;
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
