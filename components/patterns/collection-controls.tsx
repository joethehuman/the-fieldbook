"use client";
import type { ReactNode } from "react";
import { ArrowDownWideNarrow, SlidersHorizontal, X } from "lucide-react";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { EmptyState } from "./layout";

export type AppliedFilter = { id: string; label: string; onRemove: () => void };
/** Collection state stays with its owner; controls share placement and recovery. */
export function CollectionControls({
  search,
  children,
  sort,
  sortLabel,
  filters = [],
  onClear,
  actions,
  primaryAction,
}: {
  search: ReactNode;
  children?: ReactNode;
  sort?: ReactNode;
  sortLabel?: string;
  filters?: AppliedFilter[];
  onClear?: () => void;
  actions?: ReactNode;
  /** Primary collection action beside search; secondary controls get their own row. */
  primaryAction?: ReactNode;
}) {
  const secondary = (
    <>
      {children && (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline">
              <SlidersHorizontal aria-hidden="true" />
              Filters{filters.length > 0 ? ` (${filters.length})` : ""}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="grid gap-4 p-4"
            aria-label="Collection filters"
          >
            {children}
          </PopoverContent>
        </Popover>
      )}
      {sort && (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline">
              <ArrowDownWideNarrow aria-hidden="true" />
              Sort: {sortLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="grid gap-4 p-4"
            aria-label="Collection sort"
          >
            {sort}
          </PopoverContent>
        </Popover>
      )}
      {actions}
    </>
  );
  return (
    <div data-slot="collection-controls" className="grid min-w-0 gap-3">
      <div
        data-slot="collection-primary-row"
        className="flex min-w-0 flex-wrap items-center gap-3"
      >
        <div
          className={
            primaryAction
              ? "min-w-0 flex-1 basis-32"
              : "min-w-0 flex-1 basis-56"
          }
        >
          {search}
        </div>
        {primaryAction || secondary}
      </div>
      {primaryAction && (children || sort || actions) && (
        <div
          data-slot="collection-secondary-row"
          className="flex min-w-0 flex-wrap items-center gap-3"
        >
          {secondary}
        </div>
      )}
      {filters.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Applied filters"
        >
          {filters.map((filter) => (
            <Button
              key={filter.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={filter.onRemove}
              aria-label={`Remove ${filter.label} filter`}
            >
              {filter.label}
              <X className="size-3" aria-hidden="true" />
            </Button>
          ))}
          {onClear && (
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function CollectionEmpty({
  count,
  total,
  noun,
  onClear,
}: {
  count: number;
  total: number;
  noun: string;
  onClear?: () => void;
}) {
  if (count) return null;
  return (
    <EmptyState>
      <div className="grid justify-items-center gap-3">
        <p>{total ? `No ${noun} match these filters.` : `No ${noun} yet.`}</p>
        {total > 0 && onClear && (
          <Button type="button" variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
    </EmptyState>
  );
}
