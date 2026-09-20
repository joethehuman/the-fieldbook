"use client";
import { useState } from "react";

export function GroupPicker({
  groups,
  value,
  onChange,
}: {
  groups: { id: string; name: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = groups.filter((group) =>
    group.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <fieldset className="group-picker">
      <legend>
        Groups <span>{value.length} selected</span>
      </legend>
      <p className="field-help">
        Group membership determines required courses.
      </p>
      {groups.length > 6 && (
        <input
          aria-label="Find a group"
          type="search"
          placeholder="Find a group…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <div className="group-picker-options">
        {visible.map((group) => (
          <label className="group-picker-option" key={group.id}>
            <input
              type="checkbox"
              checked={value.includes(group.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, group.id]
                    : value.filter((id) => id !== group.id),
                )
              }
            />
            <span>{group.name}</span>
          </label>
        ))}
        {!visible.length && (
          <p className="field-help">
            {groups.length
              ? "No matching groups."
              : "No groups have been created yet."}
          </p>
        )}
      </div>
    </fieldset>
  );
}
