"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { prepareAdminCode } from "./section-code";
import {
  AdminContentControls,
  type ContentControlState,
} from "./AdminContentControls";
import { SectionHeader } from "../patterns/layout";
import type { Content } from "@/lib/types";
import type { Workspace } from "@/lib/store";
import { defaultSettings } from "@/lib/settings";
type ShellState = Omit<
  ContentControlState,
  "data" | "create" | "contentFilters" | "clearContentFilters"
> & {
  connect: (
    data: Workspace | null,
    create: ((kind: Content["kind"]) => void) | null,
    editing: boolean,
  ) => void;
};
const Context = createContext<ShellState | null>(null);
export const useAdminContentShell = () => useContext(Context);
export function AdminContentShell({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [contentSection, setContentSection] = useState("all"),
    [contentSort, setContentSort] = useState("created"),
    [contentStatus, setContentStatus] = useState("all");
  const [data, setData] = useState<Workspace | null>(null),
    [editing, setEditing] = useState(false);
  const create = useRef<((kind: Content["kind"]) => void) | null>(null);
  const connect = useCallback<ShellState["connect"]>((next, action, edit) => {
    setData(next);
    create.current = action;
    setEditing(edit);
  }, []);
  const warmed = useRef(false);
  useEffect(() => {
    if (!data || warmed.current || !window.requestIdleCallback) return;
    const idle = window.requestIdleCallback(() => {
      warmed.current = true;
      void prepareAdminCode("feedback").catch(() => {});
    });
    return () => window.cancelIdleCallback(idle);
  }, [data]);
  const state = {
    filter,
    setFilter,
    query,
    setQuery,
    category,
    setCategory,
    contentSection,
    setContentSection,
    contentSort,
    setContentSort,
    contentStatus,
    setContentStatus,
    connect,
  };
  const clearContentFilters = () => {
    setFilter("all");
    setQuery("");
    setCategory("all");
    setContentSection("all");
    setContentStatus("all");
  };
  const contentFilters = [
    ...(query
      ? [
          {
            id: "search",
            label: `Search: ${query}`,
            onRemove: () => setQuery(""),
          },
        ]
      : []),
    ...(category !== "all"
      ? [
          {
            id: "category",
            label: `Category: ${category}`,
            onRemove: () => setCategory("all"),
          },
        ]
      : []),
    ...(contentStatus !== "all"
      ? [
          {
            id: "status",
            label: contentStatus === "published" ? "Published" : "Draft only",
            onRemove: () => setContentStatus("all"),
          },
        ]
      : []),
    ...(contentSection !== "all"
      ? [
          {
            id: "section",
            label:
              data?.settings?.docSections?.find(
                (section) => section.id === contentSection,
              )?.name || contentSection,
            onRemove: () => setContentSection("all"),
          },
        ]
      : []),
  ];
  const empty: Workspace = {
    schema: 1,
    settings: defaultSettings,
    content: [],
    users: [],
    groups: [],
    progress: {},
  };
  return (
    <Context.Provider value={state}>
      {active && !editing && (
        <>
          <SectionHeader
            variant="page"
            title={<h2>Content</h2>}
            description="Create and maintain courses, docs, and updates."
          />
          <AdminContentControls
            {...state}
            data={data ?? empty}
            disabled={!data}
            create={(kind) => create.current?.(kind)}
            contentFilters={contentFilters}
            clearContentFilters={clearContentFilters}
          />
        </>
      )}
      {active && data && !editing && (
        <span className="sr-only" role="status">
          Content ready
        </span>
      )}
      {children}
    </Context.Provider>
  );
}
