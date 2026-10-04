"use client";
import { compareOptionalDates, sortLabels } from "@/lib/collection-sort";
import { SortPicker } from "./sort-picker";
import { useMemo, useState } from "react";
import {
  plainText,
  searchWords,
  scorePassage,
  makeResult,
  type SourcePassage,
} from "@/lib/search";
import { Highlight } from "./search-result";
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
type Sort = "newest" | "oldest" | "title" | "title-desc";
function ordered(options: ContentSelectionOption[], sort: Sort) {
  return [...options].sort((a, b) => {
    if (sort === "newest" || sort === "oldest") {
      const date = compareOptionalDates(
        a.updatedAt,
        b.updatedAt,
        sort === "newest",
      );
      if (date) return date;
    }
    const title = a.label.localeCompare(b.label);
    return (sort === "title-desc" ? -title : title) || a.id.localeCompare(b.id);
  });
}
function ranked(
  options: ContentSelectionOption[],
  sort: Sort,
  scores: Map<string, number>,
) {
  return ordered(options, sort).sort(
    (a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0),
  );
}
/** Content discovery owns filters and sorting; shared selection retains stable IDs across them. */
export function ContentSelectionList({
  options,
  value,
  onChange,
  disabled = false,
  showTypeFilter = false,
  label = "Find content",
  bounded = false,
}: {
  options: ContentSelectionOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  showTypeFilter?: boolean;
  label?: string;
  bounded?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [sortChoice, setSort] = useState<Sort>("title");
  const canSortUpdatedFor = (nextType: string) =>
    (nextType === "course" || nextType === "update" ||
      (!nextType && options.every((option) => option.type !== "curriculum"))) &&
    options.some((option) => (!nextType || option.type === nextType) && !!option.updatedAt);
  const canSortUpdated = canSortUpdatedFor(type);
  const sortForType = (nextType: string): Sort =>
    !canSortUpdatedFor(nextType) && (sortChoice === "newest" || sortChoice === "oldest")
      ? "title" : sortChoice;
  const sort = sortForType(type);
  const words = searchWords(query);
  const passages = useMemo(
    () =>
      new Map(
        options.map((option) => [
          option.id,
          {
            contentId: option.id,
            kind: option.type === "update" ? "brief" : "course",
            title: option.label,
            passageId: "content",
            lessonId: null,
            lessonTitle: null,
            text: plainText(
              [option.description, option.searchText].filter(Boolean).join(" "),
            ),
            publishedRevision: null,
            contentDate: option.updatedAt || null,
          } satisfies SourcePassage,
        ]),
      ),
    [options],
  );
  const scores = useMemo(
    () =>
      new Map(
        [...passages].map(([id, passage]) => [
          id,
          scorePassage(passage, query, { fuzzy: false }),
        ]),
      ),
    [passages, query],
  );
  const sorted = useMemo(
    () => ranked(options, sort, scores),
    [options, sort, scores],
  );
  const categories = [
    ...new Set(
      options
        .map((option) => option.category)
        .filter((name): name is string => !!name),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const matches = sorted.filter(
    (option) =>
      (!category || option.category === category) &&
      (!type || option.type === type) &&
      (!words.length || (scores.get(option.id) || 0) > 0),
  );
  const results = useMemo(
    () =>
      new Map(
        [...passages]
          .filter(([id]) => (scores.get(id) || 0) > 0)
          .map(([id, passage]) => [
            id,
            makeResult(passage, query, { fuzzy: false }),
          ]),
      ),
    [passages, scores, query],
  );
  const display = (option: ContentSelectionOption) => {
    const result = results.get(option.id);
    return {
      id: option.id,
      label: option.label,
      labelContent: result ? (
        <Highlight text={option.label} terms={result.highlights} />
      ) : undefined,
      detail: result?.excerpt ? (
        <Highlight text={result.excerpt} terms={result.highlights} />
      ) : undefined,
      description: [
        option.type === "curriculum"
          ? "Curriculum"
          : option.type === "course"
            ? "Course"
            : "Update",
        option.category,
        words.length ? undefined : option.description,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  };
  const clearFilters = () => {
    setQuery("");
    setCategory("");
    setType("");
    keepDisplayedOrder(ordered(options, sortForType("")));
  };
  const selectionInOrder = (ids: string[], order = sorted) => {
    const selected = new Set(ids);
    return order
      .filter((option) => selected.has(option.id))
      .map((option) => option.id);
  };
  const keepDisplayedOrder = (order: ContentSelectionOption[]) => {
    const next = selectionInOrder(value, order);
    if (
      next.some((id, index) => id !== value[index]) ||
      next.length !== value.length
    )
      onChange(next);
  };
  const changeType = (nextType: string) => {
    setType(nextType);
    keepDisplayedOrder(ranked(options, sortForType(nextType), scores));
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
      onRemove: () => changeType(""),
    });
  return (
    <SearchableSelectionList
      bounded={bounded}
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
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  setQuery(nextQuery);
                  const nextScores = new Map(
                    [...passages].map(([id, passage]) => [
                      id,
                      scorePassage(passage, nextQuery, { fuzzy: false }),
                    ]),
                  );
                  keepDisplayedOrder(ranked(options, sort, nextScores));
                }}
              />
            </FormField>
          }
          filters={filters}
          onClear={clearFilters}
          sort={
            <SortPicker
              label="Sort content"
              displayLabel={words.length ? "Relevance" : undefined}
              disabled={disabled}
              value={sort}
              onValueChange={(next) => {
                const nextSort = next as Sort;
                setSort(nextSort);
                keepDisplayedOrder(ranked(options, nextSort, scores));
              }}
            >
              {canSortUpdated && (
                <>
                  <option value="newest">{sortLabels.updatedNewest}</option>
                  <option value="oldest">{sortLabels.updatedOldest}</option>
                </>
              )}
              <option value="title">{sortLabels.titleAsc}</option>
              <option value="title-desc">{sortLabels.titleDesc}</option>
            </SortPicker>
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
                      changeType(next === "all" ? "" : next)
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
