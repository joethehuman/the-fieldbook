"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type SidebarState = { collapsed: boolean; courseKey?: string };
const DesktopSidebarContext = createContext<{
  state: SidebarState;
  setState: Dispatch<SetStateAction<SidebarState>>;
} | null>(null);

export function DesktopSidebarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SidebarState>({ collapsed: false });
  return (
    <DesktopSidebarContext.Provider value={{ state, setState }}>
      {children}
    </DesktopSidebarContext.Provider>
  );
}

export function useDesktopSidebar(courseKey?: string) {
  const context = useContext(DesktopSidebarContext);
  if (!context) throw new Error("Desktop sidebar requires its provider");
  const { state, setState } = context;
  // Cover the first render of a course, before the route effect stores its key.
  const enteringCourse = Boolean(courseKey && state.courseKey !== courseKey);
  const collapsed = state.collapsed || enteringCourse;
  const setCollapsed = useCallback<Dispatch<SetStateAction<boolean>>>(
    (next) =>
      setState((current) => {
        const value = typeof next === "function" ? next(current.collapsed) : next;
        return value === current.collapsed
          ? current
          : { ...current, collapsed: value };
      }),
    [setState],
  );

  useEffect(() => {
    setState((current) =>
      current.courseKey === courseKey
        ? current
        : { collapsed: courseKey ? true : current.collapsed, courseKey },
    );
  }, [courseKey, setState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey &&
        event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "s" &&
        window.matchMedia("(min-width: 48rem)").matches
      ) {
        event.preventDefault();
        setCollapsed((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCollapsed]);

  return { collapsed, setCollapsed };
}
