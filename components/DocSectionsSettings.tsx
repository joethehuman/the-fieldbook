"use client";
import { useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
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
import { useRowReorder } from "./patterns/use-row-reorder";
import { FormField } from "./patterns/form-field";
import DocSectionCreate from "./DocSectionCreate";

type DragControls = {
  handle: ReactNode;
  dragging: boolean;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: (event: DragEvent<HTMLLIElement>) => void;
};

function SectionOrderRows({
  items,
  disabled,
  onMove,
  renderRow,
}: {
  items: DocSection[];
  disabled: boolean;
  onMove: (id: string, index: number) => void;
  renderRow: (section: DocSection, siblings: DocSection[], drag: DragControls) => ReactNode;
}) {
  const drag = useRowReorder(items, onMove, disabled);
  return drag.ordered.map((section) =>
    renderRow(section, items, {
      handle: (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="order-handle"
          draggable={!disabled}
          disabled={disabled}
          aria-label={`Reorder ${section.name}; use up or down buttons`}
          onDragStart={(event) => drag.start(event, section.id)}
          onDragEnd={drag.cancel}
        >
          <GripVertical aria-hidden="true" size={17} />
        </Button>
      ),
      dragging: drag.active === section.id,
      onDragOver: (event) => drag.over(event, section.id),
      onDrop: drag.drop,
    }),
  );
}

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
  const row = (section: DocSection, siblings: DocSection[], drag: DragControls) => {
    const index = siblings.findIndex((item) => item.id === section.id);
    return (
      <ReorderRow
        key={section.id}
        data-sortable-preview
        data-dragging={drag.dragging}
        onDragOver={drag.onDragOver}
        onDrop={drag.onDrop}
        title={<strong>{section.name}</strong>}
        handle={drag.handle}
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
          <SectionOrderRows
            items={roots}
            disabled={disabled || !!conflict}
            onMove={(id, target) =>
              act(() => reorderDocSection(sections, id, target - roots.findIndex((item) => item.id === id)))
            }
            renderRow={(root, siblings, drag) => (
            <li key={root.id} className="list-none">
              <ol className="doc-order-list">
                {row(root, siblings, drag)}
                <SectionOrderRows
                  items={sections.filter((section) => section.parentId === root.id)}
                  disabled={disabled || !!conflict}
                  onMove={(id, target) => {
                    const children = sections.filter((section) => section.parentId === root.id);
                    act(() => reorderDocSection(sections, id, target - children.findIndex((item) => item.id === id)));
                  }}
                  renderRow={row}
                />
              </ol>
            </li>
            )}
          />
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
