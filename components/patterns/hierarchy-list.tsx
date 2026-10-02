"use client";
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { canBulkSelect, SelectRows } from "./bulk-selection";
import { Checkbox } from "../ui/choice";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { CollectionControls, CollectionEmpty } from "./collection-controls";
import { SelectField } from "../ui/select";
import { FormField } from "./form-field";
import { cn } from "@/lib/utils";

export type HierarchyItem = {
  id: string;
  parentId?: string;
  label: string;
  description?: string;
  meta?: ReactNode;
};
export const hierarchyMatches = (items: HierarchyItem[], query: string) =>
  items.filter((item) =>
    `${item.label} ${item.description || ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
/** Nested disclosure list, not an ARIA tree: normal Tab/Enter navigation applies. */
export function HierarchyList({
  items,
  label,
  onOpen,
  disabled = false,
  selected,
  onSelectionChange,
  selectionActions,
  searchAction,
  query: controlledQuery,
  onQueryChange,
  variant = "collection",
  activeId,
}: {
  items: HierarchyItem[];
  label: string;
  onOpen: (id: string) => void;
  disabled?: boolean;
  selected?: string[];
  onSelectionChange?: (ids: string[]) => void;
  selectionActions?: ReactNode;
  searchAction?: ReactNode;
  query?: string;
  onQueryChange?: (query: string) => void;
  variant?: "collection" | "navigation";
  activeId?: string;
}) {
  const [localQuery, setLocalQuery] = useState("");
  const query = controlledQuery ?? localQuery;
  const setQuery = onQueryChange ?? setLocalQuery;
  const [sort, setSort] = useState("name");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const search = query.trim().toLowerCase();
  const compact = variant === "navigation";
  const byId = new Map(items.map((item) => [item.id, item]));
  const activeAncestors = new Set<string>();
  let active = activeId ? byId.get(activeId) : undefined;
  while (active?.parentId && !activeAncestors.has(active.parentId)) {
    activeAncestors.add(active.parentId);
    active = byId.get(active.parentId);
  }
  const matches = hierarchyMatches(items, query);
  const visible = new Set<string>();
  for (const match of matches) {
    let item: HierarchyItem | undefined = match;
    const seen = new Set<string>();
    while (item && !seen.has(item.id)) {
      seen.add(item.id);
      visible.add(item.id);
      item = item.parentId ? byId.get(item.parentId) : undefined;
    }
  }
  function rows(parentId?: string, ancestors = new Set<string>()): ReactNode {
    return [...items]
      .sort(
        (a, b) =>
          (sort === "reverse" ? -1 : 1) * a.label.localeCompare(b.label) ||
          a.id.localeCompare(b.id),
      )
      .filter(
        (item) =>
          (parentId
            ? item.parentId === parentId
            : !item.parentId || !byId.has(item.parentId)) &&
          visible.has(item.id) &&
          !ancestors.has(item.id),
      )
      .map((item) => {
        const hasChildren = items.some(
          (child) => child.parentId === item.id && visible.has(child.id),
        );
        const open =
          !!search || expanded.has(item.id) || activeAncestors.has(item.id);
        return (
          <Collapsible
            asChild
            key={item.id}
            open={open}
            onOpenChange={(value) =>
              setExpanded((previous) => {
                const next = new Set(previous);
                if (value) next.add(item.id);
                else next.delete(item.id);
                return next;
              })
            }
          >
            <li>
              <div
                className={cn(
                  "flex min-w-0 items-center gap-2",
                  compact
                    ? "px-1 py-1"
                    : "border-b border-border px-3 py-3 last:border-b-0",
                )}
              >
                {canBulkSelect(matches.length) &&
                  matches.some((match) => match.id === item.id) &&
                  selected &&
                  onSelectionChange && (
                    <Checkbox
                      aria-label={`Select ${item.label}`}
                      disabled={disabled}
                      checked={selected.includes(item.id)}
                      onCheckedChange={(v) =>
                        onSelectionChange(
                          v === true
                            ? [...selected, item.id]
                            : selected.filter((id) => id !== item.id),
                        )
                      }
                    />
                  )}
                {hasChildren ? (
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={disabled || !!search}
                      aria-label={`${open ? "Collapse" : "Expand"} ${item.label}`}
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={open ? "rotate-90" : ""}
                      />
                    </Button>
                  </CollapsibleTrigger>
                ) : (
                  <span className="w-9 shrink-0" />
                )}
                <div className="grid min-w-0 flex-1 gap-1">
                  <Button
                    variant={compact ? "ghost" : "link"}
                    className={cn(
                      "max-w-full justify-start text-start",
                      compact &&
                        "h-auto min-h-9 whitespace-normal [overflow-wrap:anywhere]",
                      compact &&
                        activeId === item.id &&
                        "bg-muted text-foreground",
                    )}
                    disabled={disabled}
                    aria-current={activeId === item.id ? "page" : undefined}
                    aria-label={`Manage ${item.label}`}
                    onClick={() => onOpen(item.id)}
                  >
                    {item.label}
                  </Button>
                  {!compact && item.description && (
                    <p className="text-copy text-muted-foreground [overflow-wrap:anywhere]">
                      {item.description}
                    </p>
                  )}
                  {!compact && item.meta && (
                    <div className="text-copy text-muted-foreground">
                      {item.meta}
                    </div>
                  )}
                </div>
              </div>
              {hasChildren && (
                <CollapsibleContent>
                  <ul
                    className={
                      ancestors.size < 3
                        ? "ms-4 border-s border-border"
                        : "border-s border-border"
                    }
                  >
                    {rows(item.id, new Set([...ancestors, item.id]))}
                  </ul>
                </CollapsibleContent>
              )}
            </li>
          </Collapsible>
        );
      });
  }
  return (
    <div className="grid min-w-0 gap-4">
      {compact ? (
        <div className="grid min-w-0 gap-3">
          <FormField label={`Find ${label.toLowerCase()}`} visuallyHiddenLabel>
            <Input
              type="search"
              value={query}
              disabled={disabled}
              onChange={(event) => {
                setQuery(event.target.value);
                onSelectionChange?.([]);
              }}
              placeholder={`Find ${label.toLowerCase()}`}
            />
          </FormField>
          {searchAction}
        </div>
      ) : (
        <CollectionControls
          search={
            <FormField
              label={`Find ${label.toLowerCase()}`}
              visuallyHiddenLabel
            >
              <Input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  onSelectionChange?.([]);
                }}
                placeholder={`Find ${label.toLowerCase()}`}
              />
            </FormField>
          }
          sortLabel={sort === "reverse" ? "Name Z–A" : "Name A–Z"}
          sort={
            <FormField label={`Sort ${label.toLowerCase()}`}>
              <SelectField value={sort} onValueChange={setSort}>
                <option value="name">Name A–Z</option>
                <option value="reverse">Name Z–A</option>
              </SelectField>
            </FormField>
          }
          filters={
            query
              ? [
                  {
                    id: "query",
                    label: `Search: ${query}`,
                    onRemove: () => {
                      setQuery("");
                      onSelectionChange?.([]);
                    },
                  },
                ]
              : []
          }
          onClear={() => {
            setQuery("");
            onSelectionChange?.([]);
          }}
          actions={searchAction}
        />
      )}
      {!compact && (
        <p className="text-copy text-muted-foreground">
          Search includes matching {label.toLowerCase()} and their parents.
          Expand a row to explore its branch.
        </p>
      )}
      {!compact && !selectionActions && (
        <p className="text-copy text-muted-foreground" role="status">
          {matches.length} results
        </p>
      )}
      {selectionActions}
      {canBulkSelect(matches.length) && selected && onSelectionChange && (
        <div className="flex items-center gap-3">
          <SelectRows
            label={`Select all matching ${label.toLowerCase()}`}
            ids={matches.map((i) => i.id)}
            value={selected}
            onChange={onSelectionChange}
          />
          Select all matching {label.toLowerCase()} (children are not selected
          automatically)
        </div>
      )}
      {matches.length ? (
        <ul
          aria-label={label}
          className={cn(
            "min-w-0 overflow-hidden",
            compact && "max-h-96 overflow-y-auto",
            !compact && "rounded-lg border border-border",
          )}
        >
          {rows()}
        </ul>
      ) : (
        <CollectionEmpty
          count={0}
          total={items.length}
          noun={label.toLowerCase()}
          onClear={() => {
            setQuery("");
            onSelectionChange?.([]);
          }}
        />
      )}
    </div>
  );
}
