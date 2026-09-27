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
import { FormField } from "./form-field";
import { EmptyState } from "./layout";

export type HierarchyItem = {
  id: string;
  parentId?: string;
  label: string;
  description?: string;
  meta?: ReactNode;
};
/** Nested disclosure list, not an ARIA tree: normal Tab/Enter navigation applies. */
export function HierarchyList({
  items,
  label,
  onOpen,
  disabled = false,
  selected,
  onSelectionChange,
  selectionActions,
}: {
  items: HierarchyItem[];
  label: string;
  onOpen: (id: string) => void;
  disabled?: boolean;
  selected?: string[];
  onSelectionChange?: (ids: string[]) => void;
  selectionActions?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const search = query.trim().toLowerCase();
  const byId = new Map(items.map((item) => [item.id, item]));
  const matches = items.filter((item) =>
    `${item.label} ${item.description || ""}`.toLowerCase().includes(search),
  );
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
    return items
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
        const open = !!search || expanded.has(item.id);
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
              <div className="flex min-w-0 items-start gap-2 border-b border-border px-3 py-3 last:border-b-0">
                {canBulkSelect(matches.length) &&
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
                    variant="link"
                    className="max-w-full justify-start text-start"
                    disabled={disabled}
                    aria-label={`Manage ${item.label}`}
                    onClick={() => onOpen(item.id)}
                  >
                    {item.label}
                  </Button>
                  {item.description && (
                    <p className="text-copy text-muted-foreground [overflow-wrap:anywhere]">
                      {item.description}
                    </p>
                  )}
                  {item.meta && (
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
      <FormField
        label={`Find ${label.toLowerCase()}`}
        description={`Search includes matching ${label.toLowerCase()} and their parents. Expand a row to explore its branch.`}
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
      {(canBulkSelect(matches.length) || items.length === 1) &&
        selectionActions}
      {canBulkSelect(matches.length) && selected && onSelectionChange && (
        <div className="flex items-center gap-3">
          <SelectRows
            label={`Select all matching ${label.toLowerCase()}`}
            ids={matches.map((i) => i.id)}
            value={selected}
            onChange={onSelectionChange}
          />
          Select all matching {label.toLowerCase()} (children are not selected automatically)
        </div>
      )}
      {matches.length ? (
        <ul
          aria-label={label}
          className="min-w-0 overflow-hidden rounded-lg border border-border"
        >
          {rows()}
        </ul>
      ) : (
        <EmptyState>
          {items.length ? `No ${label.toLowerCase()} match your search.` : `No ${label.toLowerCase()} yet.`}
        </EmptyState>
      )}
    </div>
  );
}
