"use client";

import { useSyncExternalStore } from "react";
import { compactLayoutQuery } from "./use-compact-layout";

// A narrow desktop window is still a desktop editor. Any reported fine pointer
// (including a tablet trackpad) keeps desktop navigation and contextual formatting.
const touchWritingQuery = "(pointer: coarse) and (not (any-pointer: fine))";
const desktopEditingRequiredQuery = `${compactLayoutQuery
  .split(", ")
  .map((query) => `${query} and ${touchWritingQuery}`)
  .join(", ")}`;
function subscribe(callback: () => void) {
  const query = window.matchMedia(desktopEditingRequiredQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
export function useDesktopEditingRequired() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(desktopEditingRequiredQuery).matches,
    () => false,
  );
}
