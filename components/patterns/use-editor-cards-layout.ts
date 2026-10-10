"use client";

import { useSyncExternalStore } from "react";
import { compactLayoutQuery } from "./use-compact-layout";

// Editor presentation follows the touch dock boundary. The app shell can still
// compact its navigation and search to fit a narrow mouse-driven window.
export function useEditorCardsLayout() {
  return useMobileWritingDock();
}

export function useWritingControlsLayout() {
  return useMobileWritingDock();
}

// A narrow desktop window is still a desktop editor. Any reported fine pointer
// (including a tablet trackpad) keeps desktop navigation and contextual formatting.
export const touchWritingQuery = "(pointer: coarse) and (not (any-pointer: fine))";
const mobileDockQuery = `${compactLayoutQuery.split(", ").map((query) => `${query} and ${touchWritingQuery}`).join(", ")}`;
function subscribeMobileDock(callback: () => void) {
  const query = window.matchMedia(mobileDockQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
export function useMobileWritingDock() {
  return useSyncExternalStore(subscribeMobileDock, () => window.matchMedia(mobileDockQuery).matches, () => false);
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
