"use client";
import { useRef, useState, type DragEvent } from "react";
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  GripVertical,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import {
  availableDocSections,
  deleteDocSection,
  legacySectionConflict,
  moveDocSection,
  moveDocumentsInNavigation,
  orderedSectionDocs,
  renameDocSection,
  reorderDocInSection,
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
import { PublicationStatus } from "./patterns/publication-status";
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

type Placement = { id: string; sectionId: string };
const sectionKey = (id: string) => `section:${id}`;
const docKey = (id: string) => `doc:${id}`;
const isDoc = (key: string) => key.startsWith("doc:");
const itemId = (key: string) => key.slice(key.indexOf(":") + 1);

export function DocSectionsSettings({
  sections,
  docs,
  disabled,
  onChange,
}: {
  sections: DocSection[];
  docs: DocLink[];
  disabled: boolean;
  onChange: (sections: DocSection[], moves?: Placement[]) => void;
}) {
  const { confirm, prompt } = useInteractionDialog();
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<{ parentId: string } | null>(null);
  const createTrigger = useRef<HTMLElement | null>(null);
  const sectionTriggers = useRef(new Map<string, HTMLButtonElement>());
  const createCompleted = useRef(false);
  const createdRow = useRef<HTMLLIElement | null>(null);
  const [createdId, setCreatedId] = useState("");
  const [moving, setMoving] = useState("");
  const [moveTarget, setMoveTarget] = useState("");
  const conflict = legacySectionConflict(docs);
  const blocked = disabled || !!conflict;
  const uniqueDocs = [...new Map(docs.map((doc) => [doc.id, doc])).values()];
  const roots = sections.filter((section) => !section.parentId);
  const expandableRoots = roots.filter(
    (root) =>
      sections.some((section) => section.parentId === root.id) ||
      uniqueDocs.some((doc) => sectionForDoc(doc, sections)?.id === root.id),
  );
  const allRootsExpanded =
    expandableRoots.length > 0 &&
    expandableRoots.every((root) => expanded.has(root.id));
  const sectionVisible = (section: DocSection) =>
    !section.parentId || expanded.has(section.parentId);
  const visibleIds = [
    ...sections.filter(sectionVisible).map((section) => sectionKey(section.id)),
    ...uniqueDocs
      .filter((doc) => {
        const section = sectionForDoc(doc, sections);
        return section && sectionVisible(section) && expanded.has(section.id);
      })
      .map((doc) => docKey(doc.id)),
  ];
  const allItems = [
    ...sections.map((section) => ({
      id: sectionKey(section.id),
      label: sectionPath(section, sections),
    })),
    ...uniqueDocs.map((doc) => ({
      id: docKey(doc.id),
      label: `document ${doc.title}`,
    })),
  ];
  const selection = useBulkSelection(
    "docs-navigation",
    allItems.map((item) => item.id),
    visibleIds,
  );
  function act(change: () => { sections: DocSection[]; moves?: Placement[] }) {
    setError("");
    try {
      if (blocked)
        throw new Error(conflict || "Finish the current save first.");
      const result = change();
      onChange(result.sections, result.moves);
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    }
  }
  const changeSections = (change: () => DocSection[]) =>
    act(() => ({ sections: change() }));
  function prepareMove(keys: string[], target: string) {
    const sectionIds = keys.filter((key) => !isDoc(key)).map(itemId);
    const docIds = keys.filter(isDoc).map(itemId);
    if (!target) throw new Error("Choose a destination.");
    if (target === "root" && docIds.length)
      throw new Error("Documents must belong to a section or subsection.");
    if (
      sectionIds.some((id) =>
        sections.some(
          (child) => child.parentId === id && sectionIds.includes(child.id),
        ),
      )
    )
      throw new Error("Select either a parent or its subsection, not both.");
    let next = sections;
    for (const id of sectionIds)
      next = moveDocSection(next, id, target === "root" ? undefined : target);
    if (docIds.length)
      next = moveDocumentsInNavigation(next, uniqueDocs, docIds, target);
    return {
      sections: next,
      moves: docIds.map((id) => ({ id, sectionId: target })),
    };
  }
  function revealDestination(id: string) {
    const destination = sections.find((section) => section.id === id);
    if (destination)
      setExpanded((current) => {
        const next = new Set(current).add(destination.id);
        if (destination.parentId) next.add(destination.parentId);
        return next;
      });
  }
  function stageMove(keys: string[], target: string) {
    const success = act(() => prepareMove(keys, target));
    if (success) revealDestination(target);
    return success;
  }
  function reorder(key: string, offset: number) {
    if (!isDoc(key))
      return changeSections(() =>
        reorderDocSection(sections, itemId(key), offset),
      );
    const doc = uniqueDocs.find((item) => item.id === itemId(key));
    const section = doc && sectionForDoc(doc, sections);
    if (!section) return;
    const siblings = orderedSectionDocs(uniqueDocs, sections, section.id);
    changeSections(() =>
      reorderDocInSection(
        sections,
        uniqueDocs,
        section.id,
        doc!.id,
        siblings.findIndex((item) => item.id === doc!.id) + offset,
      ),
    );
  }
  function applyDrop(
    key: string,
    destination: { id: string; side: "before" | "after" | "inside" },
  ) {
    if (destination.side === "inside") {
      stageMove([key], itemId(destination.id));
      return;
    }
    if (isDoc(key) && isDoc(destination.id)) {
      const target = uniqueDocs.find(
        (doc) => doc.id === itemId(destination.id),
      );
      const parent = target && sectionForDoc(target, sections);
      if (!parent) return;
      const remaining = orderedSectionDocs(
        uniqueDocs,
        sections,
        parent.id,
      ).filter((doc) => doc.id !== itemId(key));
      const index =
        remaining.findIndex((doc) => doc.id === target!.id) +
        (destination.side === "after" ? 1 : 0);
      act(() => ({
        sections: moveDocumentsInNavigation(
          sections,
          uniqueDocs,
          [itemId(key)],
          parent.id,
          index,
        ),
        moves: [{ id: itemId(key), sectionId: parent.id }],
      }));
      revealDestination(parent.id);
    } else if (!isDoc(key) && !isDoc(destination.id)) {
      const target = sections.find(
        (section) => section.id === itemId(destination.id),
      );
      if (!target) return;
      changeSections(() => {
        const source = sections.find((section) => section.id === itemId(key))!;
        let next =
          source.parentId === target.parentId
            ? sections
            : moveDocSection(sections, source.id, target.parentId);
        const siblings = next.filter(
          (section) => section.parentId === target.parentId,
        );
        const others = siblings.filter((section) => section.id !== source.id);
        const index =
          others.findIndex((section) => section.id === target.id) +
          (destination.side === "after" ? 1 : 0);
        return reorderDocSection(
          next,
          source.id,
          index - siblings.findIndex((section) => section.id === source.id),
        );
      });
      if (target.parentId) revealDestination(target.parentId);
    }
  }
  const drag = useRowReorder(
    allItems,
    () => {},
    blocked,
    (item) => item.label,
    applyDrop,
  );
  function over(event: DragEvent<HTMLElement>, key: string) {
    if (!drag.active || blocked) return;
    const sourceKey = drag.active;
    if (sourceKey === key) {
      drag.over(event, key);
      return;
    }
    if (isDoc(sourceKey)) {
      if (isDoc(key)) drag.over(event, key);
      else drag.overInside(event, key);
      return;
    }
    const source = sections.find((section) => section.id === itemId(sourceKey));
    const target =
      !isDoc(key) && sections.find((section) => section.id === itemId(key));
    if (!source || !target) {
      event.stopPropagation();
      drag.clearDestination();
      return;
    }
    if (source.parentId && !target.parentId) {
      if (source.parentId !== target.id) drag.overInside(event, key);
      else {
        event.stopPropagation();
        drag.clearDestination();
      }
    } else if (source.parentId || !target.parentId) drag.over(event, key);
    else {
      event.stopPropagation();
      drag.clearDestination();
    }
  }
  const handle = (key: string, label: string) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="order-handle"
      draggable={!blocked}
      disabled={blocked}
      aria-label={`Reorder ${label}; use Move up, Move down or Move to in Actions`}
      onDragStart={(event) => drag.start(event, key)}
      onDragEnd={drag.cancel}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          reorder(key, event.key === "ArrowUp" ? -1 : 1);
        }
      }}
    >
      <GripVertical aria-hidden="true" size={17} />
    </Button>
  );
  const select = (key: string, label: string) =>
    selection.canSelect ? (
      <Checkbox
        aria-label={`Select ${label}`}
        checked={selection.selected.includes(key)}
        disabled={blocked}
        onCheckedChange={(checked) => selection.toggle(key, checked === true)}
      />
    ) : undefined;
  const openMove = (key: string) => {
    setMoving(key);
    setMoveTarget(
      isDoc(key)
        ? sectionForDoc(
            uniqueDocs.find((doc) => doc.id === itemId(key))!,
            sections,
          )?.id || ""
        : sections.find((section) => section.id === itemId(key))?.parentId ||
            "root",
    );
  };
  const moveOptions = (keys: string[]) =>
    [
      { id: "root", label: "Top level" },
      ...sections.map((section) => ({
        id: section.id,
        label: sectionPath(section, sections),
      })),
    ].filter((option) => {
      try {
        prepareMove(keys, option.id);
        return true;
      } catch {
        return false;
      }
    });
  const destination = drag.destination;
  const dropSide = (key: string) =>
    destination?.id === key && destination.side !== "inside"
      ? destination.side
      : undefined;
  function documentRows(section: DocSection) {
    const items = orderedSectionDocs(uniqueDocs, sections, section.id);
    if (!expanded.has(section.id) || !items.length) return null;
    return (
      <li className="list-none">
        <ol
          className="doc-order-list ms-6 border-s border-border ps-3"
          aria-label={`Documents in ${sectionPath(section, sections)}`}
        >
          {items.map((doc, index) => (
            <ReorderRow
              key={doc.id}
              data-sortable-preview
              data-dragging={drag.active === docKey(doc.id)}
              data-selected={selection.selected.includes(docKey(doc.id))}
              data-drop={dropSide(docKey(doc.id))}
              data-moved={drag.recentlyMoved === docKey(doc.id)}
              onDragOver={(event) => over(event, docKey(doc.id))}
              onDrop={drag.drop}
              handle={handle(docKey(doc.id), `document ${doc.title}`)}
              selection={select(docKey(doc.id), `document ${doc.title}`)}
              icon={<FileText className="size-4" />}
              title={<span className="block text-left">{doc.title}</span>}
              detail={
                <PublicationStatus published={doc.status === "published"} />
              }
              compactActions
              actions={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={blocked}
                      aria-label={`Actions for document ${doc.title}`}
                    >
                      <MoreHorizontal size={18} aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={index === 0}
                      onSelect={() => reorder(docKey(doc.id), -1)}
                    >
                      Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={index === items.length - 1}
                      onSelect={() => reorder(docKey(doc.id), 1)}
                    >
                      Move down
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openMove(docKey(doc.id))}>
                      Move to…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          ))}
        </ol>
      </li>
    );
  }
  function sectionBranch(section: DocSection, siblings: DocSection[]) {
    const key = sectionKey(section.id);
    const index = siblings.findIndex((item) => item.id === section.id);
    const children = sections.filter((item) => item.parentId === section.id);
    const count = uniqueDocs.filter((doc) => {
      const parent = sectionForDoc(doc, sections);
      return (
        parent?.id === section.id ||
        children.some((child) => child.id === parent?.id)
      );
    }).length;
    const open = expanded.has(section.id);
    const inside = destination?.id === key && destination.side === "inside";
    return (
      <li
        key={section.id}
        className="list-none"
        data-sortable-preview
        data-drop={dropSide(key)}
        data-moved={drag.recentlyMoved === key}
        data-branch-dragging={drag.active === key}
        onDragOver={(event) => over(event, key)}
        onDrop={drag.drop}
      >
        <ol className="doc-order-list">
          <ReorderRow
            ref={createdId === section.id ? createdRow : undefined}
            tabIndex={createdId === section.id ? -1 : undefined}
            handle={handle(key, sectionPath(section, sections))}
            selection={select(key, sectionPath(section, sections))}
            compactActions
            icon={
              open ? (
                <FolderOpen className="size-4" />
              ) : (
                <Folder className="size-4" />
              )
            }
            data-selected={selection.selected.includes(key)}
            data-drop-inside={inside}
            className="data-[drop-inside=true]:bg-selected data-[drop-inside=true]:border-primary"
            onDragOver={(event) => over(event, key)}
            onDrop={drag.drop}
            title={
              <strong className="block text-left [overflow-wrap:anywhere]">
                {section.name}
              </strong>
            }
            detail={
              inside
                ? `Move to ${sectionPath(section, sections)}`
                : `${count} ${count === 1 ? "doc" : "docs"}`
            }
            actions={
              <>
                {(children.length > 0 || count > 0) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={blocked}
                    aria-label={`${open ? "Collapse" : "Expand"} ${section.name}`}
                    aria-expanded={open}
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (open) next.delete(section.id);
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
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={blocked}
                      aria-label={`Actions for ${sectionPath(section, sections)}`}
                      ref={(button) => {
                        if (button)
                          sectionTriggers.current.set(section.id, button);
                        else sectionTriggers.current.delete(section.id);
                      }}
                    >
                      <MoreHorizontal size={18} aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={index === 0}
                      onSelect={() => reorder(key, -1)}
                    >
                      Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={index === siblings.length - 1}
                      onSelect={() => reorder(key, 1)}
                    >
                      Move down
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openMove(key)}>
                      Move to…
                    </DropdownMenuItem>
                    {!section.parentId && (
                      <DropdownMenuItem
                        onSelect={() => {
                          createTrigger.current =
                            sectionTriggers.current.get(section.id) || null;
                          createCompleted.current = false;
                          setCreatedId("");
                          setCreating({ parentId: section.id });
                        }}
                      >
                        Add subsection
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onSelect={async () => {
                        const name = await prompt(
                          "Rename section",
                          section.name,
                        );
                        if (name !== null)
                          changeSections(() =>
                            renameDocSection(sections, section.id, name),
                          );
                      }}
                    >
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={async () => {
                        try {
                          const next = deleteDocSection(
                            sections,
                            section.id,
                            docs,
                          );
                          if (
                            await confirm(
                              `Delete empty section ${sectionPath(section, sections)}?`,
                              {
                                submitLabel: "Delete section",
                                destructive: true,
                              },
                            )
                          )
                            changeSections(() => next);
                        } catch (error) {
                          setError((error as Error).message);
                        }
                      }}
                    >
                      Delete section
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
          {documentRows(section)}
          {open && children.length > 0 && (
            <li className="list-none">
              <ol className="doc-order-list ms-6 border-s border-border ps-3">
                {children.map((child) => sectionBranch(child, children))}
              </ol>
            </li>
          )}
        </ol>
      </li>
    );
  }
  return (
    <div>
      {conflict && <p role="alert">{conflict}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={blocked}
          onClick={(event) => {
            createTrigger.current = event.currentTarget;
            createCompleted.current = false;
            setCreatedId("");
            setCreating({ parentId: "" });
          }}
        >
          <Plus aria-hidden="true" />
          New section
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={blocked || !expandableRoots.length}
          aria-expanded={allRootsExpanded}
          onClick={() =>
            setExpanded((current) =>
              allRootsExpanded
                ? new Set()
                : new Set([
                    ...current,
                    ...expandableRoots.map((root) => root.id),
                  ]),
            )
          }
        >
          {allRootsExpanded ? "Collapse sections" : "Expand sections"}
        </Button>
      </div>
      <BulkActions
        collectionSize={selection.collectionSize}
        selected={selection.actionIds}
        onSelectionChange={selection.setSelected}
        noun="items"
        commands={[
          {
            id: "move",
            label: "Move to…",
            description:
              "Move selected documents and sections to one destination. Section documents stay attached. Review the paths, then save settings.",
            successMessage:
              "Navigation changes staged. Save settings to apply them.",
            disabledReason: blocked
              ? conflict || "Finish the current save first."
              : undefined,
            options: moveOptions(selection.actionIds),
            selectionMode: "single",
            review: (values, keys) => {
              try {
                const next = prepareMove(keys, values[0]);
                return (
                  <ul className="text-copy">
                    {keys.map((key) => (
                      <li key={key}>
                        {allItems.find((item) => item.id === key)?.label} →{" "}
                        {isDoc(key)
                          ? sectionPath(
                              next.sections.find(
                                (section) => section.id === values[0],
                              )!,
                              next.sections,
                            )
                          : sectionPath(
                              next.sections.find(
                                (section) => section.id === itemId(key),
                              )!,
                              next.sections,
                            )}
                      </li>
                    ))}
                  </ul>
                );
              } catch (error) {
                return <p role="alert">{(error as Error).message}</p>;
              }
            },
            apply: (values, keys = []) => {
              const next = prepareMove(keys, values[0]);
              if (blocked) throw new Error("Finish the current save first.");
              onChange(next.sections, next.moves);
              revealDestination(values[0]);
            },
          },
          {
            id: "delete",
            label: "Delete selected sections",
            destructive: true,
            description:
              "Delete selected empty sections. Save settings to apply the changes.",
            disabledReason: blocked
              ? conflict || "Finish the current save first."
              : selection.actionIds.some(isDoc)
                ? "Select only sections to delete them here."
                : undefined,
            apply: (_, keys = []) => {
              if (blocked || keys.some(isDoc))
                throw new Error("Select only empty sections to delete them.");
              let next = sections;
              const ids = keys
                .map(itemId)
                .sort(
                  (a, b) =>
                    Number(
                      !!sections.find((section) => section.id === b)?.parentId,
                    ) -
                    Number(
                      !!sections.find((section) => section.id === a)?.parentId,
                    ),
                );
              for (const id of ids) next = deleteDocSection(next, id, docs);
              onChange(next);
            },
          },
        ]}
      />
      {sections.length ? (
        <ol className="doc-order-list">
          {roots.map((root) => sectionBranch(root, roots))}
        </ol>
      ) : (
        <p>No sections yet. Create a section to get started.</p>
      )}
      <Dialog
        open={!!creating}
        onOpenChange={(open) => {
          if (!open) setCreating(null);
        }}
      >
        {creating && (
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (!createCompleted.current) {
                createTrigger.current?.focus({ preventScroll: true });
                return;
              }
              // Reveal only after the modal releases focus and the new row mounts.
              requestAnimationFrame(() => {
                const row = createdRow.current;
                if (!row?.isConnected) return;
                row.focus({ preventScroll: true });
                row.scrollIntoView({
                  block: "center",
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "instant"
                    : "smooth",
                });
              });
            }}
          >
            <DialogTitle>
              {creating.parentId ? "New subsection" : "New section"}
            </DialogTitle>
            <DialogDescription>
              Create a section, then save settings to apply your navigation
              changes.
            </DialogDescription>
            <DocSectionCreate
              sections={sections}
              initialParentId={creating.parentId}
              disabled={blocked}
              onCreate={(created) => {
                if (blocked)
                  throw new Error(conflict || "Finish the current save first.");
                onChange(
                  availableDocSections(docs, [], [...sections, created]),
                );
                if (created.parentId)
                  setExpanded((current) =>
                    new Set(current).add(created.parentId!),
                  );
                createCompleted.current = true;
                setCreatedId(created.id);
                setCreating(null);
              }}
              onCancel={() => setCreating(null)}
            />
          </DialogContent>
        )}
      </Dialog>
      <Dialog
        open={!!moving}
        onOpenChange={(open) => {
          if (!open) setMoving("");
        }}
      >
        {moving && (
          <DialogContent>
            <DialogTitle>
              {isDoc(moving) ? "Move document" : "Move section"}
            </DialogTitle>
            <DialogDescription>
              Choose a destination. Documents can sit at either level;
              subsections belong under top-level sections. Save settings to
              apply this move.
            </DialogDescription>
            <FormField label="Destination">
              <SelectField value={moveTarget} onValueChange={setMoveTarget}>
                {moveOptions([moving]).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </FormField>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMoving("")}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  blocked ||
                  !moveOptions([moving]).some(
                    (option) => option.id === moveTarget,
                  )
                }
                onClick={() => {
                  if (stageMove([moving], moveTarget)) setMoving("");
                }}
              >
                {isDoc(moving) ? "Move document" : "Move section"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
