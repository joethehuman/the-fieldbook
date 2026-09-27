"use client";
import { Fragment, useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronRight, GripVertical, Trash2 } from "lucide-react";
import {
  availableDocSections,
  deleteDocSection,
  legacySectionConflict,
  moveDocSection,
  renameDocSection,
  reorderDocSection,
  sectionForDoc,
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
import { BulkActions } from "./patterns/bulk-actions";
import { useBulkSelection } from "./patterns/bulk-selection";
import { Checkbox } from "./ui/choice";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./ui/dialog";

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creatingUnder, setCreatingUnder] = useState("");
  const [showDocs, setShowDocs] = useState(false);
  const [movingSection, setMovingSection] = useState("");
  const [moveTarget, setMoveTarget] = useState("root");
  const conflict = legacySectionConflict(docs);
  const uniqueDocs = [...new Map(docs.map((doc) => [doc.id, doc])).values()];
  const roots = sections.filter((section) => !section.parentId);
  const selection = useBulkSelection(
    "docs-sections",
    sections.map((section) => section.id),
  );
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
    const children = sections.filter((item) => item.parentId === section.id);
    const directDocs = uniqueDocs.filter((doc) => sectionForDoc(doc, sections)?.id === section.id);
    const subtreeDocs = directDocs.length + children.reduce((total, child) => total + uniqueDocs.filter((doc) => sectionForDoc(doc, sections)?.id === child.id).length, 0);
    const open = expanded.has(section.id);
    return (
      <ReorderRow
        key={section.id}
        data-sortable-preview={section.parentId ? true : undefined}
        data-dragging={drag.dragging}
        onDragOver={drag.onDragOver}
        onDrop={drag.onDrop}
        title={
          <div className="flex min-w-0 items-center gap-2">
            {selection.canSelect && (
              <Checkbox
                aria-label={`Select ${sectionPath(section, sections)}`}
                checked={selection.selected.includes(section.id)}
                disabled={disabled || !!conflict}
                onCheckedChange={(value) => selection.toggle(section.id, value === true)}
              />
            )}
            {children.length ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${open ? "Collapse" : "Expand"} ${section.name}`}
                aria-expanded={open}
                onClick={() => setExpanded((previous) => {
                  const next = new Set(previous);
                  if (next.has(section.id)) next.delete(section.id);
                  else next.add(section.id);
                  return next;
                })}
              >
                <ChevronRight className={open ? "rotate-90" : ""} aria-hidden="true" />
              </Button>
            ) : <span className="w-9 shrink-0" />}
            <strong className="min-w-0 [overflow-wrap:anywhere]">{section.name}</strong>
          </div>
        }
        handle={drag.handle}
        detail={
          <span>
            {section.parentId ? `${sectionPath(section, sections)} · ` : ""}
            {directDocs.length} direct {directDocs.length === 1 ? "doc" : "docs"}
            {children.length ? ` · ${subtreeDocs} total docs` : ""}
            {children.length ? ` · ${children.length} ${children.length === 1 ? "subsection" : "subsections"}` : ""}
          </span>
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
              onClick={() => { setMovingSection(section.id); setMoveTarget(section.parentId || "root"); }}
            >
              Move to…
            </Button>
            {!section.parentId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || !!conflict}
                onClick={() => {
                  setCreatingUnder(section.id);
                  setExpanded((previous) => new Set(previous).add(section.id));
                }}
              >
                Add subsection
              </Button>
            )}
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
      <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setShowDocs((value) => !value)}>
          {showDocs ? "Hide documents" : "Show documents"}
        </Button>
      </div>
      <BulkActions
        singleItemActions={false}
        collectionSize={selection.collectionSize}
        selected={selection.actionIds}
        onSelectionChange={selection.setSelected}
        noun="sections"
        commands={[{
          id: "move",
          label: "Move selected sections",
          description: "Move the selected sections to one destination. Their documents and subsections remain attached. Review the new paths before saving settings.",
          options: [{ id: "root", label: "Top level" }, ...roots.map((root) => ({ id: root.id, label: root.name }))],
          selectionMode: "single",
          review: (values, ids) => {
            const destination = values[0] === "root" ? undefined : values[0];
            try {
              if (ids.some((id) => sections.some((item) => item.parentId === id && ids.includes(item.id))))
                throw new Error("Select either a parent or its subsection, not both.");
              let next = sections;
              for (const id of ids) next = moveDocSection(next, id, destination);
              return <ul className="text-copy">{ids.map((id) => <li key={id}>{sectionPath(sections.find((item) => item.id === id)!, sections)} → {sectionPath(next.find((item) => item.id === id)!, next)}</li>)}</ul>;
            } catch (error) { return <p role="alert">{(error as Error).message}</p>; }
          },
          apply: (values, ids = []) => {
            const destination = values[0] === "root" ? undefined : values[0];
            if (ids.some((id) => sections.some((item) => item.parentId === id && ids.includes(item.id))))
              throw new Error("Select either a parent or its subsection, not both.");
            let next = sections;
            for (const id of ids) next = moveDocSection(next, id, destination);
            onChange(next);
          },
        }]}
      />
      {sections.length ? (
        <ol className="doc-order-list">
          <SectionOrderRows
            items={roots}
            disabled={disabled || !!conflict}
            onMove={(id, target) =>
              act(() => reorderDocSection(sections, id, target - roots.findIndex((item) => item.id === id)))
            }
            renderRow={(root, siblings, drag) => (
            <li key={root.id} className="list-none" data-sortable-preview>
              <ol className="doc-order-list">
                {row(root, siblings, drag)}
                {showDocs && uniqueDocs.filter((doc) => sectionForDoc(doc, sections)?.id === root.id).map((doc) => (
                  <li key={doc.id} className="ms-10 text-copy text-muted-foreground">{doc.title} · {doc.status}</li>
                ))}
                {expanded.has(root.id) && <li className="list-none"><ol className="doc-order-list ms-6 border-s border-border ps-3">
                <SectionOrderRows
                  items={sections.filter((section) => section.parentId === root.id)}
                  disabled={disabled || !!conflict}
                  onMove={(id, target) => {
                    const children = sections.filter((section) => section.parentId === root.id);
                    act(() => reorderDocSection(sections, id, target - children.findIndex((item) => item.id === id)));
                  }}
                  renderRow={(child, siblings, childDrag) => (
                    <Fragment key={child.id}>
                      {row(child, siblings, childDrag)}
                      {showDocs && uniqueDocs.filter((doc) => sectionForDoc(doc, sections)?.id === child.id).map((doc) => (
                        <li key={doc.id} className="ms-10 text-copy text-muted-foreground">{doc.title} · {doc.status}</li>
                      ))}
                    </Fragment>
                  )}
                />
                </ol></li>}
                {creatingUnder === root.id && (
                  <li className="ms-6 border-s border-border ps-3">
                    <DocSectionCreate
                      key={root.id}
                      sections={sections}
                      initialParentId={root.id}
                      disabled={disabled || !!conflict}
                      onCreate={(section) => {
                        act(() => availableDocSections(docs, [], [...sections, section]));
                        setCreatingUnder("");
                      }}
                      onCancel={() => setCreatingUnder("")}
                    />
                  </li>
                )}
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
      <Dialog open={!!movingSection} onOpenChange={(open) => { if (!open) setMovingSection(""); }}>
        {movingSection && <DialogContent>
          <DialogTitle>Move section</DialogTitle>
          <DialogDescription>Choose one top-level destination. A section’s documents and subsections keep their IDs. Save settings after moving.</DialogDescription>
          <FormField label="Destination">
            <SelectField value={moveTarget} onValueChange={setMoveTarget}>
              <option value="root">Top level</option>
              {roots.filter((root) => root.id !== movingSection).map((root) => <option key={root.id} value={root.id}>{root.name}</option>)}
            </SelectField>
          </FormField>
          <p className="text-copy text-muted-foreground">{sectionPath(sections.find((item) => item.id === movingSection)!, sections)} → {moveTarget === "root" ? sections.find((item) => item.id === movingSection)?.name : `${roots.find((item) => item.id === moveTarget)?.name} / ${sections.find((item) => item.id === movingSection)?.name}`}</p>
          {sections.some((item) => item.parentId === movingSection) && moveTarget !== "root" && <p role="alert">Move this section’s subsections first. Docs supports two levels.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMovingSection("")}>Cancel</Button>
            <Button type="button" disabled={disabled || (moveTarget === "root" ? !sections.find((item) => item.id === movingSection)?.parentId : moveTarget === sections.find((item) => item.id === movingSection)?.parentId || sections.some((item) => item.parentId === movingSection))} onClick={() => {
              act(() => moveDocSection(sections, movingSection, moveTarget === "root" ? undefined : moveTarget));
              setMovingSection("");
            }}>Move section</Button>
          </DialogFooter>
        </DialogContent>}
      </Dialog>
    </div>
  );
}
