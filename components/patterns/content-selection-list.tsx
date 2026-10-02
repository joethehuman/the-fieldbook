"use client";
import { useMemo, useState } from "react";
import { plainText, searchWords } from "@/lib/search";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SelectField } from "../ui/select";
import { CollectionControls, type AppliedFilter } from "./collection-controls";
import { FormField } from "./form-field";
import { SearchableSelectionList } from "./searchable-selection-list";

export type ContentSelectionOption = {
  id: string;
  label: string;
  type: "course" | "curriculum" | "update";
  description?: string;
  category?: string;
  updatedAt?: string;
  /** Published content passages, including course lessons and curriculum child courses. */
  searchText?: string;
};
type Sort = "newest" | "title" | "title-desc";
function ordered(options: ContentSelectionOption[], sort: Sort) {
  const timestamp = (value?: string) => {
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : -Infinity;
  };
  return [...options].sort((a, b) => {
    if (sort === "newest") {
      const first = timestamp(a.updatedAt),
        second = timestamp(b.updatedAt);
      if (first !== second) return second > first ? 1 : -1;
    }
    const title = a.label.localeCompare(b.label);
    return (sort === "title-desc" ? -title : title) || a.id.localeCompare(b.id);
  });
}
/** Content discovery owns filters and sorting; shared selection retains stable IDs across them. */
export function ContentSelectionList({
  options,
  value,
  onChange,
  disabled = false,
  showTypeFilter = false,
  label = "Find content",
}: {
  options: ContentSelectionOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  showTypeFilter?: boolean;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const sorted = useMemo(() => ordered(options, sort), [options, sort]);
  const categories = [
    ...new Set(
      options
        .map((option) => option.category)
        .filter((name): name is string => !!name),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const vocabulary = useMemo(
    () =>
      new Map(
        options.map((option) => [
          option.id,
          // Source vocabulary is unbounded; searchWords limits only query terms.
          plainText(
            [
              option.label,
              option.category,
              option.description,
              option.searchText,
            ]
              .filter(Boolean)
              .join(" "),
          )
            .toLowerCase()
            .match(/[\p{L}\p{N}]+/gu) || [],
        ]),
      ),
    [options],
  );
  const words = searchWords(query);
  const matches = sorted.filter(
    (option) =>
      (!category || option.category === category) &&
      (!type || option.type === type) &&
      words.every((word) =>
        vocabulary.get(option.id)?.some((term) => term.startsWith(word)),
      ),
  );
  const display = (option: ContentSelectionOption) => ({
    id: option.id,
    label: option.label,
    description: [
      option.type === "curriculum"
        ? "Curriculum"
        : option.type === "course"
          ? "Course"
          : "Update",
      option.category,
      option.description,
    ]
      .filter(Boolean)
      .join(" · "),
  });
  const clearFilters = () => {
    setQuery("");
    setCategory("");
    setType("");
  };
  const selectionInOrder = (ids: string[], order = sorted) => {
    const selected = new Set(ids);
    return order
      .filter((option) => selected.has(option.id))
      .map((option) => option.id);
  };
  const filters: AppliedFilter[] = [];
  if (category)
    filters.push({
      id: "category",
      label: category,
      onRemove: () => setCategory(""),
    });
  if (type)
    filters.push({
      id: "type",
      label: type === "course" ? "Courses" : "Curricula",
      onRemove: () => setType(""),
    });
  return (
    <SearchableSelectionList
      options={sorted.map(display)}
      visibleOptions={matches.map(display)}
      value={value}
      onChange={(ids) => onChange(selectionInOrder(ids))}
      disabled={disabled}
      label={label}
      emptyMessage="No content matches your search or filters."
      pageResetKey={JSON.stringify([query, category, type, sort])}
      onReviewSelected={clearFilters}
      emptyAction={
        query || category || type ? (
          <Button
            type="button"
            variant="link"
            disabled={disabled}
            onClick={clearFilters}
          >
            Clear search and filters
          </Button>
        ) : undefined
      }
      searchControls={
        <CollectionControls
          secondaryRow
          search={
            <FormField
              label={label}
              description="Search titles, descriptions and content. Selections are kept as you browse."
            >
              <Input
                type="search"
                placeholder="Search content"
                value={query}
                disabled={disabled}
                onChange={(event) => setQuery(event.target.value)}
              />
            </FormField>
          }
          filters={filters}
          onClear={clearFilters}
          sortLabel={
            sort === "newest"
              ? "Updated newest"
              : sort === "title"
                ? "Title A–Z"
                : "Title Z–A"
          }
          sort={
            <FormField label="Sort content">
              <SelectField
                disabled={disabled}
                value={sort}
                onValueChange={(next) => {
                  const nextSort = next as Sort;
                  setSort(nextSort);
                  onChange(selectionInOrder(value, ordered(options, nextSort)));
                }}
              >
                <option value="newest">Updated newest</option>
                <option value="title">Title A–Z</option>
                <option value="title-desc">Title Z–A</option>
              </SelectField>
            </FormField>
          }
        >
          {(showTypeFilter || categories.length > 0) && (
            <>
              {showTypeFilter && (
                <FormField label="Content type">
                  <SelectField
                    disabled={disabled}
                    value={type || "all"}
                    onValueChange={(next) =>
                      setType(next === "all" ? "" : next)
                    }
                  >
                    <option value="all">All</option>
                    <option value="course">Courses</option>
                    <option value="curriculum">Curricula</option>
                  </SelectField>
                </FormField>
              )}
              {!!categories.length && (
                <FormField label="Category">
                  <SelectField
                    disabled={disabled}
                    value={category}
                    onValueChange={setCategory}
                  >
                    <option value="">All categories</option>
                    {categories.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </SelectField>
                </FormField>
              )}
            </>
          )}
        </CollectionControls>
      }
    />
  );
}
