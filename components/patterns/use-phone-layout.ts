"use client";

import { useSyncExternalStore } from "react";

// Use the device viewport, not the workspace width: tablet panes can be narrow.
const query = "(max-width: 767px)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
export function usePhoneLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
