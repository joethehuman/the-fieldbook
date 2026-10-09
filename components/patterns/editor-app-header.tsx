"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const EditorAppHeaderContext = createContext<HTMLElement | null>(null);

/** Keep editor actions and their callbacks owned by the editor, in the app bar. */
export function EditorAppHeader({ children }: { children: ReactNode }) {
  const target = useContext(EditorAppHeaderContext);
  const actions = <div className="editor-app-actions"><div className="editor-header-dock-slot" aria-hidden="true" />{children}</div>;
  return target ? (
    createPortal(actions, target)
  ) : (
    <div className="editor-heading">{actions}</div>
  );
}
