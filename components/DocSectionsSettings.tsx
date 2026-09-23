"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  availableDocSections,
  deleteDocSection,
  legacySectionConflict,
  moveDocSection,
  renameDocSection,
  reorderDocSection,
  sectionPath,
  type DocLink,
  type DocSection,
} from "@/lib/docs-navigation";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { ReorderRow } from "./patterns/reorder-row";
import { FormField } from "./patterns/form-field";
import DocSectionCreate from "./DocSectionCreate";

export function DocSectionsSettings({
  sections,
  docs,
  disabled,
  onChange,
}: {
  sections: DocSection[];
  docs: DocLink[];
  disabled: boolean;
  onChange: (sections: DocSection[]) => void;
}) {
  const { confirm, prompt } = useInteractionDialog();
  const [error, setError] = useState("");
  const conflict = legacySectionConflict(docs);
  const roots = sections.filter((section) => !section.parentId);
  const act = (change: () => DocSection[]) => {
    setError("");
    try {
      if (conflict) throw new Error(conflict);
      onChange(change());
    } catch (error) {
      setError((error as Error).message);
    }
  };
  const row = (section: DocSection, siblings: DocSection[]) => {
    const index = siblings.findIndex((item) => item.id === section.id);
    return (
      <ReorderRow
        key={section.id}
        title={<strong>{section.name}</strong>}
        handle={
          <span aria-hidden="true" className="text-muted-foreground">
            {section.parentId ? "↳" : "§"}
          </span>
        }
        detail={
          <FormField label={"Placement for " + sectionPath(section, sections)}>
            <SelectField
              value={section.parentId || ""}
              disabled={disabled || !!conflict}
              onValueChange={(parentId) =>
                act(() =>
                  moveDocSection(sections, section.id, parentId || undefined),
                )
              }
            >
              <option value="">Top level</option>
              {roots
                .filter((parent) => parent.id !== section.id)
                .map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name}
                  </option>
                ))}
            </SelectField>
          </FormField>
        }
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={"Move " + sectionPath(section, sections) + " up"}
              disabled={disabled || !!conflict || index === 0}
              onClick={() =>
                act(() => reorderDocSection(sections, section.id, -1))
              }
            >
              <ArrowUp size={16} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={"Move " + sectionPath(section, sections) + " down"}
              disabled={disabled || !!conflict || index === siblings.length - 1}
              onClick={() =>
                act(() => reorderDocSection(sections, section.id, 1))
              }
            >
              <ArrowDown size={16} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || !!conflict}
              onClick={async () => {
                const name = await prompt("Rename section", section.name);
                if (name !== null)
                  act(() => renameDocSection(sections, section.id, name));
              }}
            >
              Rename
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={"Delete " + sectionPath(section, sections)}
              disabled={disabled || !!conflict}
              onClick={async () => {
                try {
                  const next = deleteDocSection(sections, section.id, docs);
                  if (
                    await confirm(
                      "Delete empty section " +
                        sectionPath(section, sections) +
                        "?",
                    )
                  )
                    act(() => next);
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          </>
        }
      />
    );
  };
  return (
    <div>
      {conflict && <p role="alert">{conflict}</p>}
      {error && <p role="alert">{error}</p>}
      {sections.length ? (
        <ol className="doc-order-list">
          {roots.map((root) => (
            <li key={root.id} className="list-none">
              <ol className="doc-order-list">
                {row(root, roots)}
                {sections
                  .filter((section) => section.parentId === root.id)
                  .map((child) =>
                    row(
                      child,
                      sections.filter(
                        (section) => section.parentId === root.id,
                      ),
                    ),
                  )}
              </ol>
            </li>
          ))}
        </ol>
      ) : (
        <p>No sections yet. Create one below.</p>
      )}
      <DocSectionCreate
        sections={sections}
        disabled={disabled || !!conflict}
        onCreate={(section) =>
          act(() => availableDocSections(docs, [], [...sections, section]))
        }
      />
    </div>
  );
}
