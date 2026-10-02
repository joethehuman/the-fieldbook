"use client";
import { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { FormField } from "./patterns/form-field";
import { sectionPath, type DocSection } from "@/lib/docs-navigation";

export function DocSectionPicker({
  sections,
  value,
  onChange,
  disabled = false,
  canCreate = true,
}: {
  sections: DocSection[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  canCreate?: boolean;
}) {
  const [query, setQuery] = useState("");
  const matches = sections.filter((section) =>
    sectionPath(section, sections)
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="space-y-3">
      <FormField
        label="Search sections"
        description="Choose one location for this Doc."
      >
        <Input
          type="search"
          value={query}
          disabled={disabled}
          placeholder="Find a section…"
          onChange={(event) => setQuery(event.target.value)}
        />
      </FormField>
      <div
        role="group"
        aria-label="Doc section choices"
        className="max-h-64 space-y-1 overflow-y-auto pe-3 [scrollbar-gutter:stable]"
      >
        {matches.map((section) => (
          <Button
            key={section.id}
            type="button"
            variant={section.id === value ? "outline" : "ghost"}
            aria-pressed={section.id === value}
            className="h-auto min-h-control w-full justify-start whitespace-normal text-left [overflow-wrap:anywhere]"
            disabled={disabled}
            onClick={() => onChange(section.id)}
          >
            {sectionPath(section, sections)}
          </Button>
        ))}
        {!matches.length && (
          <p className="text-sm text-muted-foreground">
            {sections.length
              ? "No matching sections."
              : canCreate ? "No sections yet. Create one below." : "An administrator must create a Docs section first."}
          </p>
        )}
      </div>
    </div>
  );
}
