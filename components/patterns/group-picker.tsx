"use client";
import { Checkbox } from "@/components/ui/choice";
import { Input } from "@/components/ui/input";
import { FieldGroup, FieldDescription, Field } from "@/components/ui/field";
import { useState } from "react";

export function GroupPicker({
  groups,
  value,
  onChange,
  showDescription = true,
}: {
  showDescription?: boolean;
  groups: { id: string; name: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = groups.filter((group) =>
    group.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <FieldGroup className="group-picker">
      <legend>
        Groups <span>{value.length} selected</span>
      </legend>
      {showDescription && (
        <FieldDescription>
          Learning groups personalize courses and updates. Everyone can explore
          the library.
        </FieldDescription>
      )}
      {groups.length > 6 && (
        <Input
          aria-label="Find a group"
          type="search"
          placeholder="Find a group…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <div className="group-picker-options">
        {visible.map((group) => (
          <Field
            orientation="horizontal"
            className="group-picker-option"
            key={group.id}
          >
            <Checkbox
              checked={value.includes(group.id)}
              onCheckedChange={(checked) =>
                onChange(
                  checked === true
                    ? [...value, group.id]
                    : value.filter((id) => id !== group.id),
                )
              }
            />
            <span>{group.name}</span>
          </Field>
        ))}
        {!visible.length && (
          <FieldDescription>
            {groups.length
              ? "No matching groups."
              : "No groups have been created yet."}
          </FieldDescription>
        )}
      </div>
    </FieldGroup>
  );
}
