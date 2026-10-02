"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Checkbox, Radio } from "../ui/choice";
import { Input } from "../ui/input";
import { Field, FieldGroup } from "../ui/field";
import { FormField } from "./form-field";
import { EmptyState } from "./layout";
import { Button } from "../ui/button";
import { Pagination } from "./pagination";
import { SelectionSummary } from "./selection-summary";
import { ActionGroup } from "../ui/action-group";

export type SelectionOption = {
  id: string;
  label: string;
  description?: string;
  labelContent?: ReactNode;
  detail?: ReactNode;
};
/** Bounded, searchable single or multiple selection. Search and pages never discard selections. */
export function SearchableSelectionList({
  options,
  value,
  onChange,
  label,
  disabled = false,
  selectionMode = "multiple",
  placeholder = "Name or email",
  emptyMessage = "No matching people.",
  searchControls,
  visibleOptions,
  onReviewSelected,
  pageResetKey,
  emptyAction,
  bounded = false,
}: {
  options: SelectionOption[];
  value: string[];
  onChange: (value: string[]) => void;
  label: string;
  disabled?: boolean;
  selectionMode?: "single" | "multiple";
  placeholder?: string;
  emptyMessage?: string;
  /** A specialized collection may own discovery while reusing bounded selection. */
  searchControls?: ReactNode;
  visibleOptions?: SelectionOption[];
  onReviewSelected?: () => void;
  pageResetKey?: string;
  emptyAction?: ReactNode;
  /** Fill a DialogBody, scrolling results without moving controls or actions. */
  bounded?: boolean;
}) {
  const groupName = useId();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedOnly, setSelectedOnly] = useState(false);
  useEffect(() => setPage(1), [pageResetKey]);
  useEffect(() => {
    if (!value.length) setSelectedOnly(false);
  }, [value.length]);
  const matches = (visibleOptions || options).filter(
    (option) =>
      (!selectedOnly || value.includes(option.id)) &&
      `${option.label} ${option.description || ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(matches.length / 10)),
  );
  const pageOptions = matches.slice((currentPage - 1) * 10, currentPage * 10);
  const pageSelected = pageOptions.filter((option) =>
    value.includes(option.id),
  ).length;
  return (
    <FieldGroup
      disabled={disabled}
      className={
        bounded
          ? "flex h-full min-h-0 flex-col [&>:not([data-slot=selection-results])]:shrink-0"
          : undefined
      }
    >
      {searchControls || (
        <FormField
          label={label}
          description="Selections are kept while you search or change pages."
        >
          <Input
            type="search"
            placeholder={placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </FormField>
      )}
      {selectionMode === "multiple" && options.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3">
          {pageOptions.length > 1 && (
            <Field orientation="horizontal" className="gap-2">
              <Checkbox
                aria-label={
                  matches.length > pageOptions.length
                    ? `Select page (${pageOptions.length})`
                    : `Select all ${pageOptions.length}`
                }
                disabled={disabled}
                checked={
                  pageSelected === pageOptions.length
                    ? true
                    : pageSelected
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(checked) => {
                  const ids = pageOptions.map((o) => o.id);
                  onChange(
                    checked === true
                      ? [...new Set([...value, ...ids])]
                      : value.filter((id) => !ids.includes(id)),
                  );
                }}
              />
              {matches.length > pageOptions.length
                ? `Select page (${pageOptions.length})`
                : `Select all ${pageOptions.length}`}
            </Field>
          )}
          <SelectionSummary
            range={
              matches.length
                ? `${(currentPage - 1) * 10 + 1}–${Math.min(currentPage * 10, matches.length)} of ${matches.length} shown`
                : "0 results"
            }
            count={value.length}
          />
          {matches.length > pageOptions.length &&
            pageSelected === pageOptions.length &&
            matches.some((option) => !value.includes(option.id)) && (
              <Button
                type="button"
                variant="link"
                disabled={disabled}
                onClick={() =>
                  onChange([
                    ...new Set([...value, ...matches.map((o) => o.id)]),
                  ])
                }
              >
                Select all {matches.length} matching
              </Button>
            )}
          {!!value.length && (
            <ActionGroup className="ms-auto justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  onReviewSelected?.();
                  setSelectedOnly(!selectedOnly);
                  setQuery("");
                  setPage(1);
                }}
              >
                {selectedOnly ? "Show all options" : "Review selected"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  setSelectedOnly(false);
                  onChange([]);
                }}
              >
                Clear selection
              </Button>
            </ActionGroup>
          )}
        </div>
      )}
      <div
        data-slot="selection-results"
        className={
          bounded
            ? "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
            : "grid gap-2"
        }
      >
        {pageOptions.map((option) => (
          <Field
            key={option.id}
            orientation="horizontal"
            data-selected={value.includes(option.id)}
            className="min-h-16 shrink-0 rounded-md border border-border p-3 hover:bg-muted/40 data-[selected=true]:border-primary/40 data-[selected=true]:bg-selected/40"
          >
            {selectionMode === "single" ? (
              <Radio
                name={groupName}
                value={option.id}
                disabled={disabled}
                checked={value.includes(option.id)}
                onChange={() => onChange([option.id])}
              />
            ) : (
              <Checkbox
                disabled={disabled}
                checked={value.includes(option.id)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...value, option.id]
                      : value.filter((id) => id !== option.id),
                  )
                }
              />
            )}
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <span className="block">
                {option.labelContent || option.label}
              </span>
              {option.description && (
                <span className="block text-copy font-normal text-muted-foreground">
                  {option.description}
                </span>
              )}
              {option.detail && (
                <span
                  data-slot="selection-excerpt"
                  className="mt-1 line-clamp-3 text-copy font-normal text-muted-foreground"
                >
                  {option.detail}
                </span>
              )}
            </span>
          </Field>
        ))}
        {!matches.length && (
          <EmptyState>
            {emptyMessage}
            {emptyAction}
          </EmptyState>
        )}
      </div>
      {(matches.length > 10 ||
        selectionMode === "single" ||
        options.length <= 1) && (
        <Pagination
          label="Search results"
          page={currentPage}
          pageSize={10}
          total={matches.length}
          onPageChange={setPage}
          disabled={disabled}
          showCount={selectionMode !== "multiple" || options.length <= 1}
        />
      )}
    </FieldGroup>
  );
}
