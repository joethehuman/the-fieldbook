"use client";

import { useSyncExternalStore } from "react";

// Shared by navigation, search and writing controls. Keep the compact shell
// media rule in styles/layout.css aligned with this device viewport query.
export const compactLayoutQuery = "(width < 768px), (width < 1280px) and (pointer: coarse) and (orientation: portrait)";

function subscribe(callback: () => void) {
  const media = window.matchMedia(compactLayoutQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export function useCompactLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(compactLayoutQuery).matches, () => false);
}
