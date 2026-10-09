"use client";

import { useRef, useState, type ReactNode } from "react";
import type { Content } from "@/lib/types";
import { BulkSelectionBar, SelectRows } from "./patterns/bulk-selection";
import { CollectionControls } from "./patterns/collection-controls";
import { DataTable } from "./patterns/data-table";
import { RowActions, type RowAction } from "./patterns/row-actions";
import { SearchField } from "./patterns/search-field";
import { PublicationStatus } from "./patterns/publication-status";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/choice";
import { Input } from "./ui/input";
import {
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/** Shared selection presentation, with review owned by the category panel. */
export function CategorySelectionBar({
  label,
  count,
  total,
  range,
  noun,
  busy,
  onClear,
  summaryControl,
  actions,
  className,
}: {
  label: string;
  count: number;
  total: number;
  range?: string;
  noun: string;
  busy: boolean;
  onClear: () => void;
  summaryControl?: ReactNode;
  actions: RowAction[];
  className?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = useRef<(() => void) | null>(null);
  return (
    <div role="group" aria-label={`${label} selection`}>
      <BulkSelectionBar
        className={className}
        count={count}
        total={total}
        noun={noun}
        range={range}
        onClear={onClear}
        summaryControl={summaryControl}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={trigger}
              type="button"
              variant="outline"
              disabled={busy || !count}
              aria-label={`${label} bulk actions`}
            >
              Bulk actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              const action = pending.current;
              if (!action) return;
              pending.current = null;
              event.preventDefault();
              trigger.current?.focus({ preventScroll: true });
              requestAnimationFrame(action);
            }}
          >
            {actions.map((action) => (
              <div key={action.label}>
                {action.separator && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  disabled={action.disabled}
                  className={
                    action.destructive
                      ? "text-destructive focus:text-destructive"
                      : undefined
                  }
                  onSelect={() => {
                    pending.current = action.onSelect;
                  }}
                >
                  {action.label}
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </BulkSelectionBar>
    </div>
  );
}

/** Search and selection remain outside the bounded table, including for large categories. */
export function CategoryContentTable({
  name,
  items,
  busy,
  onMove,
}: {
  name: string;
  items: Content[];
  busy: boolean;
  onMove: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const search = query.trim().toLowerCase();
  const visible = items.filter((item) =>
    (item.title || "Untitled item").toLowerCase().includes(search),
  );
  const selectedIds = selected.filter((id) =>
    items.some((item) => item.id === id),
  );
  const label = `Items in ${name}`;
  return (
    <section aria-label={label} className="grid min-w-0 gap-3">
      <CollectionControls
        search={
          <SearchField>
            <Input
              type="search"
              placeholder="Search items…"
              aria-label={`Search items in ${name}`}
              value={query}
              disabled={busy}
              onChange={(event) => setQuery(event.target.value)}
            />
          </SearchField>
        }
      />
      <CategorySelectionBar
        className="border-b-0"
        label={label}
        count={selectedIds.length}
        total={items.length}
        range={
          search ? `${visible.length} of ${items.length} items` : undefined
        }
        noun="items"
        busy={busy}
        onClear={() => setSelected([])}
        actions={[
          {
            label: "Move to category…",
            onSelect: () => onMove(selectedIds),
          },
        ]}
      />
      <TableContainer
        aria-label={`Scrollable items in ${name}`}
        className="max-h-[calc(2.5rem+5*(var(--control-height)+1rem+1px)+2px)] overflow-auto overscroll-contain rounded-none border-0 [scrollbar-gutter:stable]"
      >
        <DataTable layout="categoryItems" density="compact" aria-label={label}>
          <TableHeader className="sticky top-0 z-20 bg-background">
            <TableRow className="h-10 hover:bg-background focus-within:bg-background group-data-[pin-actions=true]/table:hover:bg-background group-data-[pin-actions=true]/table:focus-within:bg-background">
              <TableHead>
                <div className="flex items-center justify-center">
                  <SelectRows
                    ids={busy ? [] : visible.map((item) => item.id)}
                    value={selectedIds}
                    onChange={setSelected}
                    label={`Select all matching items in ${name}`}
                  />
                </div>
              </TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="group-data-[pin-actions=true]/table:last:bg-background group-data-[pin-actions=true]/table:last:before:to-background">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((item) => (
              <TableRow key={item.id} className="h-12" data-item-id={item.id}>
                <TableCell>
                  <div className="flex items-center justify-center">
                    <Checkbox
                      aria-label={`Select ${item.title || "Untitled item"}`}
                      disabled={busy}
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked === true
                            ? [...new Set([...current, item.id])]
                            : current.filter((id) => id !== item.id),
                        )
                      }
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className="block max-w-64 truncate sm:max-w-96"
                    title={item.title || "Untitled item"}
                  >
                    {item.title || "Untitled item"}
                  </span>
                </TableCell>
                <TableCell>
                  <PublicationStatus published={!!item.publishedRevision} />
                </TableCell>
                <TableCell>
                  <RowActions
                    label={item.title || "Untitled item"}
                    disabled={busy}
                    actions={[
                      {
                        label: "Move to category…",
                        onSelect: () => onMove([item.id]),
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </TableContainer>
      {!visible.length && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 text-copy text-muted-foreground"
          role="status"
        >
          <p>No items match your search.</p>
          <Button type="button" variant="ghost" onClick={() => setQuery("")}>
            Clear search
          </Button>
        </div>
      )}
    </section>
  );
}
