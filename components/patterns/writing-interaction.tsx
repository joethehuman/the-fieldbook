"use client";

import { createContext, useContext, useEffect, useId } from "react";

/** Portaled tools still belong to one writing surface, including its active ring. */
export const WritingInteractionContext = createContext<
  ((owner: string, active: boolean) => void) | null
>(null);

export function useWritingInteraction(active: boolean) {
  const report = useContext(WritingInteractionContext);
  const owner = useId();
  useEffect(() => {
    report?.(owner, active);
    return () => report?.(owner, false);
  }, [report, owner, active]);
}
