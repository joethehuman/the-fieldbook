"use client";
import type { ComponentProps } from "react";
import type { Input } from "./ui/input";
import { FormField } from "./patterns/form-field";
import { HierarchyPicker } from "./patterns/hierarchy-picker";
import type { DocSection } from "@/lib/docs-navigation";

export function DocSectionPicker({ sections, value, onChange, disabled = false, canCreate = true, inputVariant }: {
  sections: DocSection[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  canCreate?: boolean;
  inputVariant?: ComponentProps<typeof Input>["variant"];
}) {
  return (
    <FormField label="Section" visuallyHiddenLabel>
      <HierarchyPicker
        inputVariant={inputVariant}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        className="focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        options={sections.map((section) => {
          const parent = sections.find((candidate) => candidate.id === section.parentId);
          return { id: section.id, label: section.name, path: parent ? [parent.name, section.name] : [section.name] };
        })}
        placeholder="Choose a section…"
        searchLabel="Search sections"
        searchPlaceholder="Find a section…"
        visibleRows={5}
        showFullHierarchy={false}
        emptyMessage={sections.length ? "No matching sections." : canCreate ? "No sections yet. Create one below." : "An administrator must create a section first."}
      />
    </FormField>
  );
}
