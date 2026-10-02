"use client";

import {
  useEffect,
  useCallback,
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
import { ActionGroup } from "../ui/action-group";
import {
  ConnectorLine,
  type ConnectorLineGeometry,
} from "../ui/connector-line";
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
        "grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3",
        className,
      )}
    >
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="text-xs font-semibold text-muted-foreground outline-none [overflow-wrap:anywhere]"
      >
        {title}
      </h3>
      <ul
        ref={fade.ref}
        data-slot="hierarchy-column-list"
        className="scroll-fade grid min-h-0 min-w-0 content-start gap-2 overflow-y-auto pe-2 pb-1 [scrollbar-gutter:stable]"
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
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const horizontalPosition = useRef(0);
  const [connections, setConnections] = useState<ConnectorLineGeometry[]>([]);
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
  const columnKey = columns.map((column) => column.id).join("\u001f");

  const measureConnections = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.getClientRects().length) return;
    const origin = canvas.getBoundingClientRect();
    const next: typeof connections = [];
    for (const column of canvas.querySelectorAll<HTMLElement>(
      '[data-slot="hierarchy-column"][data-branch-id]',
    )) {
      const parentId = column.dataset.branchId;
      if (!parentId) continue;
      const parent = rowRefs.current
        .get(parentId)
        ?.closest<HTMLElement>("[data-hierarchy-id]");
      const parentList = parent?.closest<HTMLElement>(
        '[data-slot="hierarchy-column-list"]',
      );
      const list = column.querySelector<HTMLElement>(
        '[data-slot="hierarchy-column-list"]',
      );
      if (!parent || !parentList || !list) continue;
      const parentBounds = parent.getBoundingClientRect();
      const parentViewport = parentList.getBoundingClientRect();
      const parentY = parentBounds.top + parentBounds.height / 2;
      if (parentY < parentViewport.top || parentY > parentViewport.bottom)
        continue;
      const viewport = list.getBoundingClientRect();
      const children = [...list.children]
        .map((node) => node.getBoundingClientRect())
        .filter(
          (bounds) =>
            bounds.bottom > viewport.top && bounds.top < viewport.bottom,
        );
      if (!children.length) continue;
      const childX = children[0].left - origin.left;
      const parentX = parentBounds.right - origin.left;
      const bridgeX = (parentX + childX) / 2;
      const y = parentY - origin.top;
      const childYs = children.map(
        (bounds) =>
          Math.min(
            viewport.bottom,
            Math.max(viewport.top, bounds.top + bounds.height / 2),
          ) - origin.top,
      );
      const top = Math.min(y, ...childYs);
      const bottom = Math.max(y, ...childYs);
      next.push({ x: parentX, y, width: bridgeX - parentX, height: 0 });
      next.push({ x: bridgeX, y: top, width: 0, height: bottom - top });
      for (const childY of childYs)
        next.push({
          x: bridgeX,
          y: childY,
          width: childX - bridgeX,
          height: 0,
        });
    }
    setConnections((previous) =>
      JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
    );
  }, []);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const root = rootRef.current;
    if (!frame || !root) return;
    const owner = frame.closest<HTMLElement>(".main-content");
    let scheduled = 0;
    const measure = () => {
      if (!frame.getClientRects().length) return;
      const rem = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      const viewport = owner?.getBoundingClientRect();
      const bottomInset = owner
        ? parseFloat(getComputedStyle(owner).paddingBottom) || 0
        : rem;
      const visibleBottom = window.visualViewport
        ? window.visualViewport.offsetTop + window.visualViewport.height
        : window.innerHeight;
      const bottom = Math.min(viewport?.bottom ?? visibleBottom, visibleBottom);
      const available =
        bottom - frame.getBoundingClientRect().top - bottomInset;
      const maximum = (owner?.clientHeight ?? window.innerHeight) - bottomInset;
      const height = Math.max(16 * rem, Math.min(available, maximum));
      frame.style.setProperty("--hierarchy-height", `${Math.round(height)}px`);
      if (chartRef.current && canvasRef.current)
        canvasRef.current.style.height = `${chartRef.current.clientHeight}px`;
      measureConnections();
    };
    const schedule = () => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    observer.observe(frame);
    if (owner) observer.observe(owner);
    for (const node of frame.querySelectorAll<HTMLElement>(
      '[data-slot="hierarchy-column-list"], [data-hierarchy-id]',
    ))
      observer.observe(node);
    frame.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    owner?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(scheduled);
      observer.disconnect();
      frame.removeEventListener("scroll", schedule, true);
      owner?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [flat, columnKey, items, measureConnections]);

  useLayoutEffect(() => {
    if (!flat && chartRef.current)
      chartRef.current.scrollLeft = horizontalPosition.current;
  }, [flat]);

  function revealWithinChart(target: HTMLElement) {
    const chart = chartRef.current;
    if (!chart) return;
    const column = target.closest<HTMLElement>(
      '[data-slot="hierarchy-column"]',
    );
    if (!column) return;
    const viewport = chart.getBoundingClientRect();
    const bounds = column.getBoundingClientRect();
    const padding = 8;
    if (bounds.left < viewport.left + padding)
      chart.scrollLeft += bounds.left - viewport.left - padding;
    else if (bounds.right > viewport.right - padding)
      chart.scrollLeft += bounds.right - viewport.right + padding;
    horizontalPosition.current = chart.scrollLeft;
    const list = target.closest<HTMLElement>(
      '[data-slot="hierarchy-column-list"]',
    );
    if (list) {
      const listBounds = list.getBoundingClientRect();
      const rowBounds = target.getBoundingClientRect();
      if (rowBounds.top < listBounds.top + padding)
        list.scrollTop += rowBounds.top - listBounds.top - padding;
      else if (rowBounds.bottom > listBounds.bottom - padding)
        list.scrollTop += rowBounds.bottom - listBounds.bottom + padding;
    }
    measureConnections();
  }

  useEffect(() => {
    // Radix restores the menu trigger after unmount. Hand navigation focus off
    // from its close event so that restoration cannot undo the new destination.
    if (flat || pendingMenuBrowse.current) return;
    const frame = requestAnimationFrame(() => {
      if (reveal && revealed.current !== reveal.token) {
        const row = rowRefs.current.get(reveal.id);
        if (row?.getClientRects().length) {
          revealWithinChart(row);
          frameRef.current?.scrollIntoView({
            block: "nearest",
            inline: "nearest",
          });
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
      if (target) {
        revealWithinChart(target);
        target.focus({ preventScroll: true });
      }
      pendingBrowse.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [branchId, flat, reveal, columnKey, items, closedMenu]);

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
        <div
          className={cn(
            "grid min-w-0 gap-1 rounded-control border border-border bg-background",
            !flat &&
              activePath.has(item.id) &&
              "border-control-border bg-muted",
          )}
        >
          <div className="flex min-w-0 items-start gap-2">
            {selected && onSelectionChange && canBulkSelect(matches.length) && (
              <Checkbox
                className="ms-2 mt-2"
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
              focusRing="inside"
              disabled={disabled}
              aria-label={`Browse ${item.label} subteams`}
              aria-current={
                !flat && activePath.has(item.id) ? "location" : undefined
              }
              onClick={() => browse(item.id)}
              className="flex min-w-0 flex-1 items-start justify-between gap-2 border-0 bg-transparent px-2 py-2 text-label"
            >
              <span className="grid min-w-0 gap-1 [overflow-wrap:anywhere]">
                <span className="line-clamp-2 font-semibold" title={item.label}>
                  {item.label}
                </span>
                {showPath && (
                  <span className="text-xs text-muted-foreground">
                    {pathFor(item.id, byId)
                      .map((part) => part.label)
                      .join(" / ")}
                  </span>
                )}
                {item.description && (
                  <span
                    className="truncate text-xs text-muted-foreground"
                    title={item.description}
                  >
                    {item.description}
                  </span>
                )}
                {item.meta && (
                  <span className="text-xs text-muted-foreground">
                    {item.meta}
                  </span>
                )}
              </span>
              {childCount > 0 && (
                <ChevronRight className="mt-1 shrink-0" aria-hidden="true" />
              )}
            </ContentAction>
          </div>
          <ActionGroup variant="text" className="justify-end px-2 pb-2">
            <Button
              type="button"
              variant="link"
              size="sm"
              disabled={disabled}
              aria-label={`Open ${item.label}`}
              onClick={() => void onOpen(item.id)}
            >
              Open
            </Button>
            <Button
              type="button"
              variant="link"
              size="sm"
              disabled={disabled}
              aria-label={`Edit ${item.label}`}
              onClick={() => void onEdit(item.id)}
            >
              Edit
            </Button>
          </ActionGroup>
        </div>
      </li>
    );
  }

  return (
    <div
      ref={rootRef}
      data-slot="hierarchy-browser"
      className="grid min-w-0 gap-3 @container/hierarchy"
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
      {flat &&
        selected &&
        onSelectionChange &&
        canBulkSelect(matches.length) && (
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
      <div
        ref={frameRef}
        data-slot="hierarchy-viewport"
        className="h-[var(--hierarchy-height,24rem)] min-h-64 min-w-0 overflow-hidden"
      >
        {flat ? (
          <>
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
            ref={chartRef}
            data-slot="hierarchy-chart"
            role="region"
            aria-label={`${label} chart`}
            tabIndex={0}
            className="h-full min-w-0 overflow-x-auto overflow-y-hidden rounded-control outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onScroll={(event) => {
              horizontalPosition.current = event.currentTarget.scrollLeft;
            }}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              const chart = event.currentTarget;
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                chart.scrollLeft +=
                  (event.key === "ArrowLeft" ? -1 : 1) *
                  chart.clientWidth *
                  0.8;
              } else if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                chart.scrollLeft = event.key === "Home" ? 0 : chart.scrollWidth;
              }
            }}
            onFocusCapture={(event) => {
              if (
                event.target instanceof HTMLElement &&
                event.target !== event.currentTarget
              )
                revealWithinChart(event.target);
            }}
          >
            <div
              ref={canvasRef}
              data-slot="hierarchy-canvas"
              className="relative flex h-full w-max min-w-full items-stretch gap-8 p-1 pb-3"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
              >
                {connections.map((line, index) => (
                  <ConnectorLine key={index} {...line} />
                ))}
              </div>
              {columns.map((column) => (
                <BrowserColumn
                  key={column.id}
                  id={column.id}
                  title={column.title}
                  positions={positions.current}
                  className="relative w-64 shrink-0"
                  headingRef={(node) => {
                    if (node) headingRefs.current.set(column.id, node);
                    else headingRefs.current.delete(column.id);
                  }}
                >
                  {column.rows.map((item) => row(item))}
                </BrowserColumn>
              ))}
            </div>
          </div>
        ) : (
          <CollectionEmpty count={0} total={0} noun={label.toLowerCase()} />
        )}
      </div>
    </div>
  );
}
