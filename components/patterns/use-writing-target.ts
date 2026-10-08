"use client";

import { useEffect, useRef, useState } from "react";
import type { LexicalEditor } from "lexical";

/** A real prose caret/selection, not an old editor selection behind another field. */
export function hasWritingTarget(editor: LexicalEditor | null, allowDock = false) {
  const surface = editor?.getRootElement();
  const active = document.activeElement;
  const selection = window.getSelection();
  if (!surface || !selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  const proseFocus = active instanceof HTMLElement && surface.contains(active)
    && active.isContentEditable && !active.closest(".writing-code-block");
  const touchSelection = active === document.body && !selection.isCollapsed;
  const dockFocus = allowDock && active instanceof HTMLButtonElement && !active.disabled
    && !!active.closest(".writing-toolbar-controls") && !!active.getAttribute("aria-label")?.startsWith("Commands:");
  return (proseFocus || touchSelection || dockFocus) && surface.contains(range.startContainer)
    && (surface.contains(range.endContainer) || !selection.isCollapsed && range.intersectsNode(surface));
}

export function useWritingTarget(editor: LexicalEditor | null, enabled: boolean) {
  const [target, setTarget] = useState(false);
  const valid = useRef(false);
  useEffect(() => {
    if (!enabled) { valid.current = false; return; }
    let active = true;
    const update = () => {
      if (!active) return;
      valid.current = hasWritingTarget(editor) || valid.current && hasWritingTarget(editor, true);
      setTarget(valid.current);
    };
    const blur = () => queueMicrotask(update);
    update();
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", blur);
    document.addEventListener("selectionchange", update);
    document.addEventListener("pointerup", update);
    const unregister = editor?.registerUpdateListener(update);
    return () => {
      active = false;
      unregister?.();
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("pointerup", update);
    };
  }, [editor, enabled]);
  return enabled && target;
}
