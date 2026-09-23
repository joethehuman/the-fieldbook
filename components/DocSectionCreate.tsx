"use client";
import { FormField } from "@/components/patterns/form-field";
import { ActionGroup } from "@/components/ui/action-group";
import { Input } from "@/components/ui/input";

import { useState } from "react";
import { Button } from "./ui/button";
import { newDocSection } from "@/lib/docs-navigation";

export default function DocSectionCreate({
  sections,
  onCreate,
  onCancel,
  disabled = false,
  onBusyChange,
}: {
  sections: string[];
  onCreate: (name: string) => void | Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    if (busy || disabled) return;
    setError("");
    try {
      const section = newDocSection(name, sections);
      setBusy(true);
      onBusyChange?.(true);
      await onCreate(section);
      setName("");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <div className="doc-section-create">
      <FormField label="New section name">
        <Input
          value={name}
          maxLength={80}
          disabled={disabled || busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void create();
            }
          }}
        />
      </FormField>
      <ActionGroup>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy || !name.trim()}
          onClick={create}
        >
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
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
