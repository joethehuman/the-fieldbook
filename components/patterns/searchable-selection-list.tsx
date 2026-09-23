"use client";
import { useState } from "react";
import { Checkbox } from "../ui/choice";
import { Input } from "../ui/input";
import { Field, FieldGroup } from "../ui/field";
import { FormField } from "./form-field";
import { EmptyState } from "./layout";
import { Pagination } from "./pagination";

export type SelectionOption = {
  id: string;
  label: string;
  description?: string;
};
/** Bounded, searchable multi-selection. Search and pages never discard selections. */
export function SearchableSelectionList({
  options,
  value,
  onChange,
  label,
  disabled = false,
}: {
  options: SelectionOption[];
  value: string[];
  onChange: (value: string[]) => void;
  label: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const matches = options.filter((option) =>
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
          placeholder="Name or email"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </FormField>
      <div className="grid gap-3">
        {matches
          .slice((currentPage - 1) * 10, currentPage * 10)
          .map((option) => (
            <Field
              key={option.id}
              orientation="horizontal"
              className="rounded-md border border-border p-3"
            >
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
        {!matches.length && <EmptyState>No matching people.</EmptyState>}
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
