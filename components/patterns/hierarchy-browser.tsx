"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/choice";
import { Input } from "../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { CollectionControls, CollectionEmpty } from "./collection-controls";
import { FormField } from "./form-field";
import { canBulkSelect, SelectRows } from "./bulk-selection";
import { useScrollFade } from "./use-scroll-fade";
import { ContentAction } from "./content-action";

export type HierarchyBrowserItem = {
  id: string;
  parentId?: string;
  label: string;
  description?: string;
  meta?: ReactNode;
};

function pathFor(id: string, byId: Map<string, HierarchyBrowserItem>) {
  const path: HierarchyBrowserItem[] = [];
  const seen = new Set<string>();
  let item = byId.get(id);
  while (item && !seen.has(item.id)) {
    seen.add(item.id);
    path.unshift(item);
    item = item.parentId ? byId.get(item.parentId) : undefined;
  }
  return path;
}

export function hierarchyBrowserMatches(
  items: HierarchyBrowserItem[],
  query: string,
) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const search = query.trim().toLowerCase();
  return items.filter((item) =>
    `${item.label} ${item.description || ""} ${pathFor(item.id, byId)
      .map((part) => part.label)
      .join(" / ")}`
      .toLowerCase()
      .includes(search),
  );
}

function BrowserColumn({
  id,
  title,
  className,
  positions,
  headingRef,
  children,
}: {
  id: string;
  title: string;
  className?: string;
  positions: Map<string, number>;
  headingRef: (node: HTMLHeadingElement | null) => void;
  children: ReactNode;
}) {
  const fade = useScrollFade<HTMLUListElement>();
  useLayoutEffect(() => {
    const list = fade.ref.current;
    if (list) list.scrollTop = positions.get(id) || 0;
    fade.measure();
  }, [id, positions, fade.ref, fade.measure]);
  return (
    <section
      data-slot="hierarchy-column"
      data-branch-id={id}
      aria-label={title}
      className={cn(
        "grid min-w-0 content-start gap-3 rounded-lg border border-border bg-muted/30 p-3",
        className,
      )}
    >
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="text-label font-semibold outline-none [overflow-wrap:anywhere]"
      >
        {title}
      </h3>
      <ul
        ref={fade.ref}
        data-slot="hierarchy-column-list"
        className="scroll-fade grid max-h-[min(28rem,calc(100dvh-20rem))] min-h-32 min-w-0 content-start gap-2 overflow-y-auto pe-2 [scrollbar-gutter:stable]"
        data-scroll-fade-before={fade.edges.before}
        data-scroll-fade-after={fade.edges.after}
        onScroll={(event) => {
          positions.set(id, event.currentTarget.scrollTop);
          fade.measure();
        }}
      >
        {children}
      </ul>
    </section>
  );
}

/** The owner controls navigation and mutations; this is a disclosure browser, not an ARIA tree. */
export function HierarchyBrowser({
  items,
  label,
  branchId,
  onBrowse,
  onOpen,
  onEdit,
  query,
  onQueryChange,
  disabled = false,
  primaryAction,
  secondaryActions,
  selected,
  onSelectionChange,
  selectionActions,
  reveal,
}: {
  items: HierarchyBrowserItem[];
  label: string;
  branchId: string;
  onBrowse: (id: string) => void | Promise<void>;
  onOpen: (id: string) => void | Promise<void>;
  onEdit: (id: string) => void | Promise<void>;
  query: string;
  onQueryChange: (query: string) => void;
  disabled?: boolean;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  selected?: string[];
  onSelectionChange?: (ids: string[]) => void;
  selectionActions?: ReactNode;
  reveal?: { id: string; token: number };
}) {
  const positions = useRef(new Map<string, number>());
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const headingRefs = useRef(new Map<string, HTMLHeadingElement>());
  const pendingBrowse = useRef<string | null>(null);
  const pendingMenuBrowse = useRef(false);
  const [closedMenu, setClosedMenu] = useState(0);
  const revealed = useRef<number | null>(null);
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = [...items].sort(
    (a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id),
  );
  const path = pathFor(branchId, byId);
  const activePath = new Set(path.map((item) => item.id));
  const search = query.trim().toLowerCase();
  const flat = !!search || selected !== undefined;
  const matches = hierarchyBrowserMatches(ordered, query);
  const roots = ordered.filter(
    (item) => !item.parentId || !byId.has(item.parentId),
  );
  const columns = [
    { id: "", title: `Top-level ${label.toLowerCase()}`, rows: roots },
    ...path.flatMap((item) => {
      const rows = ordered.filter((child) => child.parentId === item.id);
      return rows.length
        ? [{ id: item.id, title: `Subteams of ${item.label}`, rows }]
        : [];
    }),
  ];
  const visibleColumns = columns.slice(-3);
  const lastColumn = visibleColumns.at(-1)!;

  useEffect(() => {
    // Radix restores the menu trigger after unmount. Hand navigation focus off
    // from its close event so that restoration cannot undo the new destination.
    if (flat || pendingMenuBrowse.current) return;
    const frame = requestAnimationFrame(() => {
      if (reveal && revealed.current !== reveal.token) {
        const row = rowRefs.current.get(reveal.id);
        if (row?.getClientRects().length) {
          row.scrollIntoView({ block: "nearest", inline: "nearest" });
          row.focus({ preventScroll: true });
          revealed.current = reveal.token;
          pendingBrowse.current = null;
          return;
        }
      }
      if (pendingBrowse.current !== branchId) return;
      const target = columns.some((column) => column.id === branchId)
        ? headingRefs.current.get(branchId)
        : rowRefs.current.get(branchId);
      target?.focus({ preventScroll: true });
      pendingBrowse.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [branchId, flat, reveal, columns, closedMenu]);

  function browse(id: string) {
    pendingBrowse.current = id;
    void onBrowse(id);
  }
  function row(item: HierarchyBrowserItem, showPath = false) {
    const childCount = items.filter(
      (child) => child.parentId === item.id,
    ).length;
    return (
      <li
        key={item.id}
        data-hierarchy-id={item.id}
        className="min-w-0 @container/hierarchy-row"
      >
        <div className="grid min-w-0 gap-2 rounded-control border border-border bg-background p-2 @min-[26rem]/hierarchy-row:grid-cols-[minmax(0,1fr)_auto] @min-[26rem]/hierarchy-row:items-center">
          <div className="flex min-w-0 items-start gap-2">
            {selected && onSelectionChange && canBulkSelect(matches.length) && (
              <Checkbox
                className="mt-3"
                aria-label={`Select ${item.label}`}
                checked={selected.includes(item.id)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onSelectionChange(
                    checked === true
                      ? [...selected, item.id]
                      : selected.filter((id) => id !== item.id),
                  )
                }
              />
            )}
            <ContentAction
              ref={(node) => {
                if (node) rowRefs.current.set(item.id, node);
                else rowRefs.current.delete(item.id);
              }}
              type="button"
              disabled={disabled}
              aria-label={`Browse ${item.label} subteams`}
              aria-current={
                !flat && activePath.has(item.id) ? "location" : undefined
              }
              onClick={() => browse(item.id)}
              className={cn(
                "flex min-w-0 flex-1 items-start justify-between gap-3 border-transparent px-3 py-3 text-label",
                !flat &&
                  activePath.has(item.id) &&
                  "bg-muted ring-1 ring-border",
              )}
            >
              <span className="grid min-w-0 gap-1 [overflow-wrap:anywhere]">
                <span className="font-semibold">{item.label}</span>
                {showPath && (
                  <span className="text-copy text-muted-foreground">
                    {pathFor(item.id, byId)
                      .map((part) => part.label)
                      .join(" / ")}
                  </span>
                )}
                {item.description && (
                  <span className="text-copy text-muted-foreground">
                    {item.description}
                  </span>
                )}
                {item.meta && (
                  <span className="text-copy text-muted-foreground">
                    {item.meta}
                  </span>
                )}
              </span>
              {childCount > 0 && (
                <ChevronRight className="mt-1 shrink-0" aria-hidden="true" />
              )}
            </ContentAction>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              aria-label={`Open ${item.label}`}
              onClick={() => void onOpen(item.id)}
            >
              Open
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`Edit ${item.label}`}
              onClick={() => void onEdit(item.id)}
            >
              Edit
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <div
      data-slot="hierarchy-browser"
      className="grid min-w-0 gap-4 @container/hierarchy"
    >
      <CollectionControls
        search={
          <FormField label={`Find ${label.toLowerCase()}`} visuallyHiddenLabel>
            <Input
              type="search"
              value={query}
              disabled={disabled}
              placeholder={`Find ${label.toLowerCase()}`}
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </FormField>
        }
        primaryAction={primaryAction}
        actions={secondaryActions}
      />
      {!flat && path.length > 0 && (
        <nav aria-label={`${label} path`}>
          <ol className="flex min-w-0 flex-wrap items-center gap-1 text-label text-muted-foreground">
            <li>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => browse("")}
              >
                {label}
              </Button>
            </li>
            {path.length > 2 && (
              <li className="flex items-center gap-1">
                <ChevronRight className="size-3" aria-hidden="true" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      aria-label={`${label} ancestors`}
                    >
                      <MoreHorizontal aria-hidden="true" />
                      Ancestors
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] max-w-[min(24rem,calc(100vw-2rem))]"
                    onCloseAutoFocus={(event) => {
                      if (!pendingMenuBrowse.current) return;
                      event.preventDefault();
                      pendingMenuBrowse.current = false;
                      setClosedMenu((count) => count + 1);
                    }}
                  >
                    {path.slice(0, -1).map((item) => (
                      <DropdownMenuItem
                        key={item.id}
                        onSelect={() => {
                          pendingMenuBrowse.current = true;
                          browse(item.id);
                        }}
                      >
                        {pathFor(item.id, byId)
                          .map((part) => part.label)
                          .join(" / ")}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )}
            {(path.length > 2 ? path.slice(-1) : path).map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 max-w-full items-center gap-1"
              >
                <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-w-0 max-w-full whitespace-normal text-start [overflow-wrap:anywhere]"
                  disabled={disabled}
                  onClick={() => browse(item.id)}
                  aria-current={item.id === branchId ? "location" : undefined}
                >
                  {item.label}
                </Button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {selectionActions}
      {flat ? (
        <>
          {selected && onSelectionChange && canBulkSelect(matches.length) && (
            <div className="flex items-center gap-3">
              <SelectRows
                label={`Select all matching ${label.toLowerCase()}`}
                ids={matches.map((item) => item.id)}
                value={selected}
                onChange={onSelectionChange}
              />
              Select all matching {label.toLowerCase()}
            </div>
          )}
          {matches.length ? (
            <BrowserColumn
              id="results"
              title={
                search
                  ? `${matches.length} matching ${label.toLowerCase()}`
                  : `All ${label.toLowerCase()}`
              }
              positions={positions.current}
              headingRef={() => undefined}
            >
              {matches.map((item) => row(item, true))}
            </BrowserColumn>
          ) : (
            <CollectionEmpty
              count={0}
              total={items.length}
              noun={label.toLowerCase()}
              onClear={() => onQueryChange("")}
            />
          )}
        </>
      ) : roots.length ? (
        <div
          className={cn(
            "grid min-w-0 items-start gap-4",
            visibleColumns.length > 1 && "@min-[38rem]/hierarchy:grid-cols-2",
            visibleColumns.length > 2 && "@min-[60rem]/hierarchy:grid-cols-3",
          )}
        >
          {visibleColumns.map((column, index) => {
            const fromEnd = visibleColumns.length - 1 - index;
            return (
              <BrowserColumn
                key={column.id}
                id={column.id}
                title={column.title}
                positions={positions.current}
                className={
                  fromEnd === 2
                    ? "hidden @min-[60rem]/hierarchy:grid"
                    : fromEnd === 1
                      ? "hidden @min-[38rem]/hierarchy:grid"
                      : undefined
                }
                headingRef={(node) => {
                  if (node) headingRefs.current.set(column.id, node);
                  else headingRefs.current.delete(column.id);
                }}
              >
                {column.rows.map((item) => row(item))}
              </BrowserColumn>
            );
          })}
        </div>
      ) : (
        <CollectionEmpty count={0} total={0} noun={label.toLowerCase()} />
      )}
      {!flat && lastColumn.rows.length > 0 && (
        <p className="text-copy text-muted-foreground">
          Browse follows the reporting branch. Open shows a team’s people; Edit
          changes its details.
        </p>
      )}
    </div>
  );
}
