"use client";
import { FormField } from "./patterns/form-field";
import { ActionGroup } from "./ui/action-group";
import { Input } from "./ui/input";
import { SelectField } from "./ui/select";
import { Button } from "./ui/button";
import { useState, type ComponentProps } from "react";
import { Plus } from "lucide-react";
import { createDocSection, type DocSection } from "@/lib/docs-navigation";

export default function DocSectionCreate({
  sections,
  onCreate,
  onCancel,
  initialParentId = "",
  disabled = false,
  inputVariant,
}: {
  sections: DocSection[];
  onCreate: (section: DocSection) => void | Promise<void>;
  onCancel?: () => void;
  initialParentId?: string;
  disabled?: boolean;
  inputVariant?: ComponentProps<typeof Input>["variant"];
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(initialParentId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    if (busy || disabled) return;
    setError("");
    try {
      const next = createDocSection(sections, name, parentId || undefined);
      const section = next[next.length - 1];
      setBusy(true);
      await onCreate(section);
      setName("");
      setParentId(initialParentId);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="doc-section-create">
      <FormField label="New section name" error={error}>
        <Input
          variant={inputVariant}
          value={name}
          maxLength={80}
          disabled={disabled || busy}
          aria-invalid={!!error}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void create();
            }
          }}
        />
      </FormField>
      <FormField
        label="Top-level parent"
        description="Optional. Leave blank to create a top-level section."
      >
        <SelectField
          value={parentId}
          onValueChange={setParentId}
          disabled={disabled || busy}
        >
          <option value="">No parent</option>
          {sections
            .filter((section) => !section.parentId)
            .map((section) => (
              <option value={section.id} key={section.id}>
                {section.name}
              </option>
            ))}
        </SelectField>
      </FormField>
      <ActionGroup>
        <Button
          type="button"
          disabled={disabled || busy || !name.trim()}
          onClick={create}
        >
          <Plus aria-hidden="true" />
          {busy ? "Creating…" : "Create section"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </ActionGroup>
    </div>
  );
}
