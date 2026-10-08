"use client";

import { useSyncExternalStore } from "react";
import { compactLayoutQuery, useCompactLayout } from "./use-compact-layout";

// Navigation, editor controls and search use one device layout boundary.
export function useEditorCardsLayout() {
  return useCompactLayout();
}

export function useWritingControlsLayout() {
  return useCompactLayout();
}

// Native selection menus have no feature-detection API. Compact views and
// touch-first browsers retain native selection instead of a second popup.
const nativeSelectionQuery = `${compactLayoutQuery}, (pointer: coarse)`;
function subscribeNativeSelection(callback: () => void) {
  const query = window.matchMedia(nativeSelectionQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
export function useNativeWritingSelection() {
  return useSyncExternalStore(subscribeNativeSelection, () => window.matchMedia(nativeSelectionQuery).matches, () => false);
}
