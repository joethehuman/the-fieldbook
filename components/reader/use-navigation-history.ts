"use client";
import { useCallback, useEffect, useRef } from "react";
const markerKey = "__fieldbookNavigation";
type Marker = { owner: string; kind: "base" | "sentinel" };
type Pair = { owner: string; url: string };
type Observation = { url: string; marker?: Marker };

/** Keep an adjacent native Back on the same URL while an async form guard decides. */
export function useNavigationHistory(
  protectedState: boolean,
  canLeave: () => Promise<boolean>,
) {
  const pair = useRef<Pair | null>(null);
  const retired = useRef(new Map<string, Pair & { previousUrl?: string }>());
  const retiring = useRef<Pair | null>(null);
  const cleaned = useRef<Pair | null>(null);
  const observed = useRef<Observation | null>(null);
  const restoring = useRef<Pair | null>(null);
  const cleaning = useRef<Pair | null>(null);
  const cleanupWaiters = useRef<((completed: boolean) => void)[]>([]);
  const leaving = useRef(false);
  const departureUrl = useRef<string | null>(null);
  const latest = useRef({ protectedState, canLeave });
  const reconcile = useRef(() => {});
  latest.current = { protectedState, canLeave };
  const marker = () => window.history.state?.[markerKey] as Marker | undefined;
  const matches = (expected: Pair, kind: Marker["kind"]) =>
    marker()?.owner === expected.owner &&
    marker()?.kind === kind &&
    window.location.href === expected.url;
  const clean = useCallback(() => {
    const current = pair.current;
    if (cleaning.current) return;
    if (!current || !matches(current, "sentinel")) {
      pair.current = null;
      return;
    }
    cleaning.current = current;
    window.history.back();
  }, []);
  reconcile.current = () => {
    if (cleaning.current || restoring.current || leaving.current) return;
    if (latest.current.protectedState && !pair.current) {
      const next = { owner: crypto.randomUUID(), url: window.location.href };
      const base = {
        ...window.history.state,
        [markerKey]: { owner: next.owner, kind: "base" },
      };
      window.history.replaceState(base, "", next.url);
      window.history.pushState(
        { ...base, [markerKey]: { owner: next.owner, kind: "sentinel" } },
        "",
        next.url,
      );
      pair.current = next;
      observed.current = { url: next.url, marker: marker() };
    } else if (!latest.current.protectedState && pair.current) clean();
  };
  useEffect(() => {
    observed.current = { url: window.location.href, marker: marker() };
    const pop = () => {
      const previous = observed.current;
      observed.current = { url: window.location.href, marker: marker() };
      const savedPair = cleaned.current;
      if (
        savedPair &&
        previous?.marker?.owner === savedPair.owner &&
        previous.marker.kind === "base" &&
        window.location.href !== savedPair.url
      ) {
        retired.current.set(savedPair.owner, {
          ...savedPair,
          previousUrl: window.location.href,
        });
        cleaned.current = null;
      }
      const landed = marker();
      const old = landed && retired.current.get(landed.owner);
      if (old && landed.kind === "base" && window.location.href === old.url) {
        // Skip only our positively identified retired adjacent entry, retaining Forward.
        if (
          previous?.marker?.owner === old.owner &&
          previous.marker.kind === "sentinel"
        ) {
          window.history.back();
          return;
        }
        if (previous?.url === old.previousUrl) {
          window.history.forward();
          return;
        }
      }
      if (retiring.current) {
        const oldPair = retiring.current;
        retiring.current = null;
        retired.current.set(oldPair.owner, {
          ...oldPair,
          previousUrl: window.location.href,
        });
      }
      if (cleaning.current) {
        const expected = cleaning.current;
        const completed = matches(expected, "base");
        cleaning.current = null;
        if (pair.current?.owner === expected.owner) pair.current = null;
        if (completed) {
          if (leaving.current) {
            const state = { ...window.history.state };
            delete state[markerKey];
            window.history.replaceState(state, "", expected.url);
          } else {
            // A saved form retains one Forward entry; retire its duplicate pair.
            retired.current.set(expected.owner, expected);
            cleaned.current = expected;
          }
        }
        const waiters = cleanupWaiters.current.splice(0);
        for (const done of waiters) done(completed);
        // Dirty/busy state can change while same-URL cleanup is in flight.
        if (completed) reconcile.current();
        return;
      }
      if (restoring.current) {
        const expected = restoring.current;
        restoring.current = null;
        if (
          pair.current?.owner !== expected.owner ||
          !matches(expected, "sentinel")
        )
          return;
        void latest.current.canLeave().then((approved) => {
          // Fence the continuation to the exact activation that asked permission.
          if (
            !approved ||
            pair.current?.owner !== expected.owner ||
            !matches(expected, "sentinel")
          )
            return;
          retired.current.set(expected.owner, expected);
          retiring.current = expected;
          pair.current = null;
          window.history.go(-2);
        });
        return;
      }
      const current = pair.current;
      // Arbitrary multi-entry traversal is not assumed to land on an adjacent base.
      if (current && matches(current, "base")) {
        restoring.current = current;
        window.history.forward();
      }
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => reconcile.current(), [protectedState]);
  const beforeNavigation = useCallback(async () => {
    leaving.current = true;
    departureUrl.current = window.location.href;
    if (
      !cleaning.current &&
      (!pair.current || !matches(pair.current, "sentinel"))
    ) {
      pair.current = null;
      const current = marker();
      if (current?.kind === "base" && retired.current.has(current.owner)) {
        const state = { ...window.history.state };
        delete state[markerKey];
        window.history.replaceState(state, "", window.location.href);
        retired.current.delete(current.owner);
        if (cleaned.current?.owner === current.owner) cleaned.current = null;
      }
      return true;
    }
    const completed = new Promise<boolean>((done) =>
      cleanupWaiters.current.push(done),
    );
    clean();
    const restored = await completed;
    // Let the router commit its same-URL popstate restoration before a new push.
    if (restored)
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
    return restored;
  }, [clean]);
  const finishNavigation = useCallback((options?: { preserveForm?: boolean }) => {
    if (!leaving.current) return;
    leaving.current = false;
    // A new destination must not inherit the departed form's dirty state.
    // Canonical URL replacements keep that form open, including newer edits
    // made while the save that supplied the canonical title was in flight.
    const stayed = departureUrl.current === window.location.href;
    departureUrl.current = null;
    observed.current = { url: window.location.href, marker: marker() };
    if (stayed || options?.preserveForm) reconcile.current();
  }, []);
  return { beforeNavigation, finishNavigation };
}
