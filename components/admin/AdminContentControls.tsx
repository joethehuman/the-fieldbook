"use client";
import { prepareAdminCode } from "./section-code";
import { CollectionControls } from "../patterns/collection-controls";
import { CollectionToolbar } from "../patterns/layout";
import { FilterOptions } from "../patterns/filter-options";
import { ActionGroup } from "../ui/action-group";
import { Button } from "../ui/button";
import { Plus } from "lucide-react";
import { FormField } from "../patterns/form-field";
import { Input } from "../ui/input";
import { SelectField } from "../ui/select";
import { availableDocSections } from "@/lib/docs-navigation";
import type { Workspace } from "@/lib/store";
import type { Content } from "@/lib/types";
export type ContentControlState = {
  filter: string;
  setFilter: (value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  contentSection: string;
  setContentSection: (value: string) => void;
  contentSort: string;
  setContentSort: (value: string) => void;
  contentStatus: string;
  setContentStatus: (value: string) => void;
  data: Workspace;
  create: (kind: Content["kind"]) => void;
  contentFilters: { id: string; label: string; onRemove: () => void }[];
  clearContentFilters: () => void;
  disabled?: boolean;
};
export function AdminContentControls({
  filter,
  query,
  category,
  contentSection,
  contentSort,
  contentStatus,
  setFilter,
  setQuery,
  setCategory,
  setContentSection,
  setContentSort,
  setContentStatus,
  data,
  create,
  contentFilters,
  clearContentFilters,
  disabled,
}: ContentControlState) {
  return (
    <>
      <CollectionToolbar
        filters={
          <FilterOptions
            label="Content type"
            variant="underline"
            value={filter}
            onValueChange={(value) => {
              setFilter(value);
              setContentSection("all");
              setCategory("all");
            }}
            options={[
              { value: "all", label: "All content" },
              { value: "doc", label: "Docs" },
              { value: "brief", label: "Updates" },
              { value: "course", label: "Courses" },
            ]}
          />
        }
      >
        <ActionGroup>
          <Button
            onPointerEnter={() => {
              void prepareAdminCode("editor").catch(() => {});
            }}
            onFocus={() => {
              void prepareAdminCode("editor").catch(() => {});
            }}
            disabled={disabled}
            onClick={() => create("doc")}
          >
            <Plus size={15} />
            Doc
          </Button>
          <Button
            onPointerEnter={() => {
              void prepareAdminCode("editor").catch(() => {});
            }}
            onFocus={() => {
              void prepareAdminCode("editor").catch(() => {});
            }}
            disabled={disabled}
            onClick={() => create("brief")}
          >
            <Plus size={15} />
            Update
          </Button>
          <Button
            onPointerEnter={() => {
              void prepareAdminCode("editor").catch(() => {});
            }}
            onFocus={() => {
              void prepareAdminCode("editor").catch(() => {});
            }}
            disabled={disabled}
            variant="default"
            onClick={() => create("course")}
          >
            <Plus size={15} />
            Course
          </Button>
        </ActionGroup>
      </CollectionToolbar>
      <CollectionControls
        filters={contentFilters}
        onClear={clearContentFilters}
        sortLabel={
          contentSort === "created"
            ? "Newest created"
            : contentSort === "title"
              ? "Title A–Z"
              : contentSort === "updated"
                ? "Recently updated"
                : "Oldest update first"
        }
        sort={
          <FormField label="Sort content">
            <SelectField value={contentSort} onValueChange={setContentSort}>
              <option value="created">Newest created</option>
              <option value="title">Title A–Z</option>
              <option value="updated">Recently updated</option>
              <option value="oldest">Oldest update first</option>
            </SelectField>
          </FormField>
        }
        search={
          <FormField label="Search content" visuallyHiddenLabel>
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search content by title, summary, or folder"
            />
          </FormField>
        }
      >
        {filter !== "doc" && (
          <FormField label="Category">
            <SelectField
              value={category}
              onValueChange={(value) => setCategory(value)}
            >
              <option value="all">All categories</option>
              {[
                ...new Set(
                  data.content
                    .filter((c) => filter === "all" || c.kind === filter)
                    .map((c) => c.category),
                ),
              ]
                .sort()
                .map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
            </SelectField>
          </FormField>
        )}
        <FormField label="Publication status">
          <SelectField value={contentStatus} onValueChange={setContentStatus}>
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft only</option>
          </SelectField>
        </FormField>
        {filter === "doc" && (
          <FormField label="Docs section">
            <SelectField
              value={contentSection}
              onValueChange={setContentSection}
            >
              <option value="all">All sections</option>
              {availableDocSections(
                data.content.filter((c) => c.kind === "doc"),
                data.settings?.docCategoryOrder,
                data.settings?.docSections,
              ).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.parentId
                    ? `${data.settings?.docSections?.find((p) => p.id === s.parentId)?.name || s.legacyCategory} / `
                    : ""}
                  {s.name}
                </option>
              ))}
            </SelectField>
          </FormField>
        )}
      </CollectionControls>
    </>
  );
}
