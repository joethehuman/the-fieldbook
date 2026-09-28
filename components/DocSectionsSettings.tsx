"use client";
import { Fragment, useState, type DragEvent, type ReactNode } from "react";
import { ChevronRight, GripVertical, MoreHorizontal } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type DragControls = {
  handle: ReactNode;
  dragging: boolean;
  dropPosition?: "before" | "after";
  recentlyMoved: boolean;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: (event: DragEvent<HTMLLIElement>) => void;
};

function SectionOrderRows({
  items,
  disabled,
  onMove,
  previewLabel,
  renderRow,
}: {
  items: DocSection[];
  disabled: boolean;
  onMove: (id: string, index: number) => void;
  previewLabel?: (section: DocSection) => string;
  renderRow: (
    section: DocSection,
    siblings: DocSection[],
    drag: DragControls,
  ) => ReactNode;
}) {
  const drag = useRowReorder(
    items,
    onMove,
    disabled,
    previewLabel || ((section) => section.name),
  );
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
      dropPosition:
        drag.destination?.id === section.id ? drag.destination.side : undefined,
      recentlyMoved: drag.recentlyMoved === section.id,
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
  const [creatingRoot, setCreatingRoot] = useState(false);
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
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    }
  };
  const row = (
    section: DocSection,
    siblings: DocSection[],
    drag: DragControls,
  ) => {
    const index = siblings.findIndex((item) => item.id === section.id);
    const children = sections.filter((item) => item.parentId === section.id);
    const directDocs = uniqueDocs.filter(
      (doc) => sectionForDoc(doc, sections)?.id === section.id,
    );
    const subtreeDocs =
      directDocs.length +
      children.reduce(
        (total, child) =>
          total +
          uniqueDocs.filter(
            (doc) => sectionForDoc(doc, sections)?.id === child.id,
          ).length,
        0,
      );
    const open = expanded.has(section.id);
    return (
      <ReorderRow
        key={section.id}
        data-sortable-preview={section.parentId ? true : undefined}
        data-dragging={drag.dragging}
        data-selected={selection.selected.includes(section.id)}
        data-drop={section.parentId ? drag.dropPosition : undefined}
        data-moved={section.parentId ? drag.recentlyMoved : undefined}
        onDragOver={section.parentId ? drag.onDragOver : undefined}
        onDrop={section.parentId ? drag.onDrop : undefined}
        title={
          <div className="flex min-w-0 items-center gap-2">
            {children.length ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${open ? "Collapse" : "Expand"} ${section.name}`}
                aria-expanded={open}
                onClick={() =>
                  setExpanded((previous) => {
                    const next = new Set(previous);
                    if (next.has(section.id)) next.delete(section.id);
                    else next.add(section.id);
                    return next;
                  })
                }
              >
                <ChevronRight
                  className={open ? "rotate-90" : ""}
                  aria-hidden="true"
                />
              </Button>
            ) : (
              <span className="w-9 shrink-0" />
            )}
            <strong className="min-w-0 [overflow-wrap:anywhere]">
              {section.name}
            </strong>
          </div>
        }
        handle={drag.handle}
        compactActions
        selection={
          selection.canSelect ? (
            <Checkbox
              aria-label={`Select ${sectionPath(section, sections)}`}
              checked={selection.selected.includes(section.id)}
              disabled={disabled || !!conflict}
              onCheckedChange={(value) =>
                selection.toggle(section.id, value === true)
              }
            />
          ) : undefined
        }
        detail={
          <span>
            {children.length ? subtreeDocs : directDocs.length}{" "}
            {children.length
              ? subtreeDocs === 1
                ? "doc total"
                : "docs total"
              : directDocs.length === 1
                ? "doc"
                : "docs"}
            {children.length
              ? ` · ${children.length} ${children.length === 1 ? "subsection" : "subsections"}`
              : ""}
          </span>
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || !!conflict}
                aria-label={`Actions for ${sectionPath(section, sections)}`}
              >
                <MoreHorizontal size={18} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={index === 0}
                onSelect={() =>
                  act(() => reorderDocSection(sections, section.id, -1))
                }
              >
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={index === siblings.length - 1}
                onSelect={() =>
                  act(() => reorderDocSection(sections, section.id, 1))
                }
              >
                Move down
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setMovingSection(section.id);
                  setMoveTarget(section.parentId || "root");
                }}
              >
                Move to…
              </DropdownMenuItem>
              {!section.parentId && (
                <DropdownMenuItem
                  onSelect={() => {
                    setCreatingUnder(section.id);
                    setExpanded((previous) =>
                      new Set(previous).add(section.id),
                    );
                  }}
                >
                  Add subsection
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={async () => {
                  const name = await prompt("Rename section", section.name);
                  if (name !== null)
                    act(() => renameDocSection(sections, section.id, name));
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={async () => {
                  try {
                    const next = deleteDocSection(sections, section.id, docs);
                    if (
                      await confirm(
                        `Delete empty section ${sectionPath(section, sections)}?`,
                      )
                    )
                      act(() => next);
                  } catch (error) {
                    setError((error as Error).message);
                  }
                }}
              >
                Delete section
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    );
  };
  return (
    <div>
      {conflict && <p role="alert">{conflict}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !!conflict}
          onClick={() => setCreatingRoot((value) => !value)}
        >
          {creatingRoot ? "Cancel new section" : "New section"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowDocs((value) => !value)}
        >
          {showDocs ? "Hide documents" : "Show documents"}
        </Button>
      </div>
      <BulkActions
        singleItemActions={false}
        collectionSize={selection.collectionSize}
        selected={selection.actionIds}
        onSelectionChange={selection.setSelected}
        noun="sections"
        commands={[
          {
            id: "move",
            label: "Move selected sections",
            description:
              "Move the selected sections to one destination. Their documents and subsections remain attached. Review the new paths before saving settings.",
            options: [
              { id: "root", label: "Top level" },
              ...roots.map((root) => ({ id: root.id, label: root.name })),
            ],
            selectionMode: "single",
            review: (values, ids) => {
              const destination = values[0] === "root" ? undefined : values[0];
              try {
                if (
                  ids.some((id) =>
                    sections.some(
                      (item) => item.parentId === id && ids.includes(item.id),
                    ),
                  )
                )
                  throw new Error(
                    "Select either a parent or its subsection, not both.",
                  );
                let next = sections;
                for (const id of ids)
                  next = moveDocSection(next, id, destination);
                return (
                  <ul className="text-copy">
                    {ids.map((id) => (
                      <li key={id}>
                        {sectionPath(
                          sections.find((item) => item.id === id)!,
                          sections,
                        )}{" "}
                        →{" "}
                        {sectionPath(
                          next.find((item) => item.id === id)!,
                          next,
                        )}
                      </li>
                    ))}
                  </ul>
                );
              } catch (error) {
                return <p role="alert">{(error as Error).message}</p>;
              }
            },
            apply: (values, ids = []) => {
              const destination = values[0] === "root" ? undefined : values[0];
              if (
                ids.some((id) =>
                  sections.some(
                    (item) => item.parentId === id && ids.includes(item.id),
                  ),
                )
              )
                throw new Error(
                  "Select either a parent or its subsection, not both.",
                );
              let next = sections;
              for (const id of ids)
                next = moveDocSection(next, id, destination);
              onChange(next);
            },
          },
        ]}
      />
      {sections.length ? (
        <ol className="doc-order-list">
          <SectionOrderRows
            items={roots}
            disabled={disabled || !!conflict}
            previewLabel={(section) =>
              `${section.name} · ${sections.filter((child) => child.parentId === section.id).length} subsections`
            }
            onMove={(id, target) =>
              act(() =>
                reorderDocSection(
                  sections,
                  id,
                  target - roots.findIndex((item) => item.id === id),
                ),
              )
            }
            renderRow={(root, siblings, drag) => (
              <li
                key={root.id}
                className="list-none"
                data-sortable-preview
                data-drop={drag.dropPosition}
                data-moved={drag.recentlyMoved}
                data-branch-dragging={drag.dragging}
                onDragOver={drag.onDragOver}
                onDrop={drag.onDrop}
              >
                <ol className="doc-order-list">
                  {row(root, siblings, drag)}
                  {showDocs &&
                    uniqueDocs
                      .filter(
                        (doc) => sectionForDoc(doc, sections)?.id === root.id,
                      )
                      .map((doc) => (
                        <li
                          key={doc.id}
                          className="ms-10 text-copy text-muted-foreground"
                        >
                          {doc.title} · {doc.status}
                        </li>
                      ))}
                  {expanded.has(root.id) && (
                    <li className="list-none">
                      <ol className="doc-order-list ms-6 border-s border-border ps-3">
                        <SectionOrderRows
                          items={sections.filter(
                            (section) => section.parentId === root.id,
                          )}
                          disabled={disabled || !!conflict}
                          onMove={(id, target) => {
                            const children = sections.filter(
                              (section) => section.parentId === root.id,
                            );
                            act(() =>
                              reorderDocSection(
                                sections,
                                id,
                                target -
                                  children.findIndex((item) => item.id === id),
                              ),
                            );
                          }}
                          renderRow={(child, siblings, childDrag) => (
                            <Fragment key={child.id}>
                              {row(child, siblings, childDrag)}
                              {showDocs &&
                                uniqueDocs
                                  .filter(
                                    (doc) =>
                                      sectionForDoc(doc, sections)?.id ===
                                      child.id,
                                  )
                                  .map((doc) => (
                                    <li
                                      key={doc.id}
                                      className="ms-10 text-copy text-muted-foreground"
                                    >
                                      {doc.title} · {doc.status}
                                    </li>
                                  ))}
                            </Fragment>
                          )}
                        />
                      </ol>
                    </li>
                  )}
                  {creatingUnder === root.id && (
                    <li className="ms-6 border-s border-border ps-3">
                      <DocSectionCreate
                        key={root.id}
                        sections={sections}
                        initialParentId={root.id}
                        disabled={disabled || !!conflict}
                        onCreate={(section) => {
                          act(() =>
                            availableDocSections(
                              docs,
                              [],
                              [...sections, section],
                            ),
                          );
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
      {creatingRoot && (
        <DocSectionCreate
          sections={sections}
          disabled={disabled || !!conflict}
          onCreate={(section) => {
            if (
              act(() => availableDocSections(docs, [], [...sections, section]))
            )
              setCreatingRoot(false);
          }}
          onCancel={() => setCreatingRoot(false)}
        />
      )}
      <Dialog
        open={!!movingSection}
        onOpenChange={(open) => {
          if (!open) setMovingSection("");
        }}
      >
        {movingSection && (
          <DialogContent>
            <DialogTitle>Move section</DialogTitle>
            <DialogDescription>
              Choose one top-level destination. A section’s documents and
              subsections keep their IDs. Save settings after moving.
            </DialogDescription>
            <FormField label="Destination">
              <SelectField value={moveTarget} onValueChange={setMoveTarget}>
                <option value="root">Top level</option>
                {roots
                  .filter((root) => root.id !== movingSection)
                  .map((root) => (
                    <option key={root.id} value={root.id}>
                      {root.name}
                    </option>
                  ))}
              </SelectField>
            </FormField>
            <p className="text-copy text-muted-foreground">
              {sectionPath(
                sections.find((item) => item.id === movingSection)!,
                sections,
              )}{" "}
              →{" "}
              {moveTarget === "root"
                ? sections.find((item) => item.id === movingSection)?.name
                : `${roots.find((item) => item.id === moveTarget)?.name} / ${sections.find((item) => item.id === movingSection)?.name}`}
            </p>
            {sections.some((item) => item.parentId === movingSection) &&
              moveTarget !== "root" && (
                <p role="alert">
                  Move this section’s subsections first. Docs supports two
                  levels.
                </p>
              )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMovingSection("")}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  disabled ||
                  (moveTarget === "root"
                    ? !sections.find((item) => item.id === movingSection)
                        ?.parentId
                    : moveTarget ===
                        sections.find((item) => item.id === movingSection)
                          ?.parentId ||
                      sections.some((item) => item.parentId === movingSection))
                }
                onClick={() => {
                  act(() =>
                    moveDocSection(
                      sections,
                      movingSection,
                      moveTarget === "root" ? undefined : moveTarget,
                    ),
                  );
                  setMovingSection("");
                }}
              >
                Move section
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
