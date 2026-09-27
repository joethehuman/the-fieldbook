"use client";
import { useId, useState } from "react";
import { Checkbox, Radio } from "../ui/choice";
import { Input } from "../ui/input";
import { Field, FieldGroup } from "../ui/field";
import { FormField } from "./form-field";
import { EmptyState } from "./layout";
import { Button } from "../ui/button";
import { Pagination } from "./pagination";

export type SelectionOption = {
  id: string;
  label: string;
  description?: string;
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
}: {
  options: SelectionOption[];
  value: string[];
  onChange: (value: string[]) => void;
  label: string;
  disabled?: boolean;
  selectionMode?: "single" | "multiple";
  placeholder?: string;
  emptyMessage?: string;
}) {
  const groupName = useId();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const matches = options.filter(
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
  return (
    <FieldGroup disabled={disabled}>
      <FormField
        label={label}
        description={`${value.length} selected. Selections are kept while you search or change pages.`}
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
      {selectionMode === "multiple" && options.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          {matches.length > 1 && (
            <Field orientation="horizontal">
              <Checkbox
                aria-label="Select this page"
                disabled={disabled || !matches.length}
                checked={
                  matches
                    .slice((currentPage - 1) * 10, currentPage * 10)
                    .every((o) => value.includes(o.id)) && !!matches.length
                    ? true
                    : matches
                          .slice((currentPage - 1) * 10, currentPage * 10)
                          .some((o) => value.includes(o.id))
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(checked) => {
                  const ids = matches
                    .slice((currentPage - 1) * 10, currentPage * 10)
                    .map((o) => o.id);
                  onChange(
                    checked === true
                      ? [...new Set([...value, ...ids])]
                      : value.filter((id) => !ids.includes(id)),
                  );
                }}
              />
              Select this page
            </Field>
          )}
          {matches.length > 10 && (
            <Button
              type="button"
              variant="link"
              disabled={disabled}
              onClick={() =>
                onChange([...new Set([...value, ...matches.map((o) => o.id)])])
              }
            >
              Select all {matches.length} matching items
            </Button>
          )}
          {!!value.length && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setSelectedOnly(!selectedOnly);
                setQuery("");
                setPage(1);
              }}
            >
              {selectedOnly
                ? "Show all options"
                : `Review ${value.length} selected`}
            </Button>
          )}
          {!!value.length && (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange([])}
            >
              Clear selection
            </Button>
          )}
        </div>
      )}
      <div className="grid gap-3">
        {matches
          .slice((currentPage - 1) * 10, currentPage * 10)
          .map((option) => (
            <Field
              key={option.id}
              orientation="horizontal"
              className="rounded-md border border-border p-3"
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
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="block">{option.label}</span>
                {option.description && (
                  <span className="block text-copy font-normal text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </span>
            </Field>
          ))}
        {!matches.length && <EmptyState>{emptyMessage}</EmptyState>}
      </div>
      <Pagination
        label="Search results"
        page={currentPage}
        pageSize={10}
        total={matches.length}
        onPageChange={setPage}
        disabled={disabled}
      />
    </FieldGroup>
  );
}
