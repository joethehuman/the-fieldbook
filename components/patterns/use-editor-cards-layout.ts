"use client";

import { useSyncExternalStore } from "react";
import { compactLayoutQuery } from "./use-compact-layout";

// Editor presentation follows the touch editor boundary. The app shell can still
// compact its navigation and search to fit a narrow mouse-driven window.
export function useEditorCardsLayout() {
  return useMobileEditorLayout();
}

// A narrow desktop window is still a desktop editor. Any reported fine pointer
// (including a tablet trackpad) keeps desktop navigation and contextual formatting.
export const touchWritingQuery = "(pointer: coarse) and (not (any-pointer: fine))";
const mobileEditorQuery = `${compactLayoutQuery.split(", ").map((query) => `${query} and ${touchWritingQuery}`).join(", ")}`;
function subscribeMobileEditor(callback: () => void) {
  const query = window.matchMedia(mobileEditorQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
export function useMobileEditorLayout() {
  return useSyncExternalStore(subscribeMobileEditor, () => window.matchMedia(mobileEditorQuery).matches, () => false);
}

// Native selection callouts have no feature-detection API. Touch-only devices
// retain their native selection UI at every width.
const nativeSelectionQuery = touchWritingQuery;
function subscribeNativeSelection(callback: () => void) {
  const query = window.matchMedia(nativeSelectionQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
export function useNativeWritingSelection() {
  return useSyncExternalStore(subscribeNativeSelection, () => window.matchMedia(nativeSelectionQuery).matches, () => false);
}
