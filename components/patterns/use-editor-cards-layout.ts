"use client";

import { useCompactLayout } from "./use-compact-layout";

// Navigation, editor controls and search use one device layout boundary.
export function useEditorCardsLayout() {
  return useCompactLayout();
}

export function useWritingControlsLayout() {
  return useCompactLayout();
}
