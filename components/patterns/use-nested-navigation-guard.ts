"use client";
import { useCallback, useEffect, useRef } from "react";
import type {
  NavigationGuard,
  RegisterNavigationGuard,
} from "@/lib/navigation-guard";

/** A dialog can protect its draft without replacing the surrounding editor's guard. */
export function useNestedNavigationGuard(
  guard: NavigationGuard,
  protectedDraft: boolean,
  register?: RegisterNavigationGuard,
): RegisterNavigationGuard {
  const current = useRef({ guard, protectedDraft, register });
  current.current = { guard, protectedDraft, register };
  const child = useRef<NavigationGuard | null>(null);
  const childProtected = useRef(false);
  const sync = useCallback(() => {
    current.current.register?.(
      async () => {
        if (child.current && !(await child.current())) return false;
        return current.current.guard();
      },
      { protected: current.current.protectedDraft || childProtected.current },
    );
  }, []);
  useEffect(() => {
    sync();
    return () => register?.(null);
  }, [register, protectedDraft, sync]);
  return useCallback(
    (next, options) => {
      child.current = next;
      childProtected.current = !!options?.protected;
      sync();
    },
    [sync],
  );
}
