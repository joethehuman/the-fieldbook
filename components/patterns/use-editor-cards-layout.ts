"use client";

import { useSyncExternalStore } from "react";
import { compactLayoutQuery, useCompactLayout } from "./use-compact-layout";

// Panels and navigation retain the existing compact layout boundary.
export function useEditorCardsLayout() {
  return useCompactLayout();
}

export function useWritingControlsLayout() {
  return useCompactLayout();
}

// A narrow desktop window is still a desktop editor. Any reported fine pointer
// (including a tablet trackpad) keeps the in-page controls and formatting popup.
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
