"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Plus,
  Tag,
} from "lucide-react";
import type { Workspace } from "@/lib/store";
import { defaultSettings } from "@/lib/settings";
import { equalJson } from "@/lib/equal-json";
import {
  categoryItems,
  categoryLists,
  categoryName,
  type CategoryKind,
  type ContentCategories,
} from "@/lib/content-categories";
import type {
  CategoryMove,
  SaveCategories,
} from "@/lib/category-settings-save";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import type { Content } from "@/lib/types";
import { PendingChangesBar } from "./patterns/pending-changes-bar";
import { SettingsSection } from "./patterns/settings-section";
import { CollectionControls } from "./patterns/collection-controls";
import { SearchField } from "./patterns/search-field";
import { ReorderRow } from "./patterns/reorder-row";
import { useRowReorder } from "./patterns/use-row-reorder";
import { FormField } from "./patterns/form-field";
import { PublicationStatus } from "./patterns/publication-status";
import { EmptyState } from "./patterns/layout";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SelectField } from "./ui/select";
import { Checkbox } from "./ui/choice";
import { Alert } from "./ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { useToast } from "./ui/toast";

const kinds = ["course", "brief"] as const;
const labels = { course: "Courses", brief: "Updates" };

export function CategorySettingsPanel({
  data,
  onSave,
  registerNavigationGuard,
}: {
  data: Workspace;
  onSave?: SaveCategories;
  registerNavigationGuard?: RegisterNavigationGuard;
}) {
  const initial = (workspace: Workspace) => ({
    ...defaultSettings,
    ...workspace.settings,
    contentCategories: categoryLists(
      [...(workspace.publishedContent || []), ...workspace.content],
      workspace.settings,
    ),
  });
  const [settings, setSettings] = useState(() => initial(data));
  const [moves, setMoves] = useState<CategoryMove[]>([]);
  const [tab, setTab] = useState<CategoryKind>("course");
  const [queries, setQueries] = useState({ course: "", brief: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [create, setCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const baseline = useRef(settings);
  const saveBase = useRef(data);
  const notify = useToast();
  const { confirm } = useInteractionDialog();
  const dirty = moves.length > 0 || !equalJson(settings, baseline.current);
  const guard = useRef(async () => true);
  guard.current = async () =>
    !busy &&
    (!dirty ||
      (await confirm("Leave this page? Unsaved changes will be discarded.")));
  useEffect(() => {
    registerNavigationGuard?.(() => guard.current(), {
      protected: dirty || busy,
    });
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      registerNavigationGuard?.(null);
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty, busy, registerNavigationGuard]);
  const projected = (items: Content[]) =>
    items.map((item) => {
      const move = moves.find((candidate) => candidate.id === item.id);
      return move ? { ...item, category: move.category } : item;
    });
  const drafts = projected(data.content);
  const published = projected(data.publishedContent || []);
  function update(categories: ContentCategories) {
    setSettings((current) => ({ ...current, contentCategories: categories }));
  }
  function stage(ids: string[], kind: CategoryKind, category: string) {
    setMoves((current) => [
      ...current.filter((move) => !ids.includes(move.id)),
      ...ids.flatMap((id) => {
        const item = data.content.find(
          (entry) => entry.id === id && entry.kind === kind,
        );
        if (!item) return [];
        const live = data.publishedContent?.find((entry) => entry.id === id);
        return item.category === category &&
          (!live || live.category === category)
          ? []
          : [{ id, kind, category, expected: item.revision || 0 }];
      }),
    ]);
  }
  async function save() {
    if (busy || !dirty) return;
    setBusy(true);
    setError("");
    try {
      if (!onSave)
        throw new Error(
          "Category settings are unavailable. Reload this page before saving.",
        );
      const result = await onSave(saveBase.current, settings, moves);
      saveBase.current = result.data;
      const saved = initial(result.data);
      baseline.current = saved;
      setSettings(result.error ? settings : saved);
      setMoves(result.remaining);
      if (result.error) setError(result.error);
      else notify("Categories saved.");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const active = dirty || busy || !!error;
  return (
    <div className="settings-panel min-w-0">
      <PendingChangesBar
        active={active}
        feedback={
          error ? (
            <Alert
              variant="destructive"
              role="alert"
              onDismiss={() => setError("")}
            >
              {error}
            </Alert>
          ) : undefined
        }
        actions={
          dirty || busy ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setSettings(baseline.current);
                  setMoves([]);
                  setError("");
                }}
              >
                Discard changes
              </Button>
              <Button type="button" loading={busy} onClick={() => void save()}>
                {busy ? "Saving…" : "Save settings"}
              </Button>
            </>
          ) : null
        }
      >
        {busy ? "Saving changes…" : dirty ? "Unsaved changes" : null}
      </PendingChangesBar>
      <SettingsSection
        id="settings-categories"
        title={<h2>Categories</h2>}
        description="Use categories to organize courses and updates."
        measure="full"
        className={active ? "rounded-t-none border-t-0" : undefined}
      >
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as CategoryKind)}
        >
          <TabsList aria-label="Category type">
            {kinds.map((kind) => (
              <TabsTrigger key={kind} value={kind} disabled={busy}>
                {labels[kind]}
              </TabsTrigger>
            ))}
          </TabsList>
          {kinds.map((kind) => (
            <TabsContent key={kind} value={kind}>
              <div className="mb-4 grid gap-3">
                <p className="max-w-prose text-copy text-muted-foreground">
                  {kind === "course"
                    ? "Reorder categories to change their order on the Courses page. Curricula always appear at the bottom."
                    : "Update categories are listed alphabetically. They do not change the order of the Updates feed."}
                </p>
                <CollectionControls
                  search={
                    <SearchField>
                      <Input
                        type="search"
                        value={queries[kind]}
                        onChange={(event) =>
                          setQueries((current) => ({
                            ...current,
                            [kind]: event.target.value,
                          }))
                        }
                        placeholder="Search categories…"
                        aria-label={`Search ${kind === "course" ? "course" : "update"} categories`}
                        disabled={busy}
                      />
                    </SearchField>
                  }
                  primaryAction={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setNewName("");
                        setCreateError("");
                        setCreate(true);
                      }}
                    >
                      <Plus aria-hidden="true" />
                      Create category
                    </Button>
                  }
                />
                {kind === "course" && queries[kind].trim() && (
                  <p className="text-copy text-muted-foreground">
                    Clear search to reorder categories.
                  </p>
                )}
              </div>
              <CategoryList
                kind={kind}
                categories={settings.contentCategories}
                drafts={drafts}
                published={published}
                busy={busy}
                query={queries[kind]}
                onClearSearch={() =>
                  setQueries((current) => ({ ...current, [kind]: "" }))
                }
                onChange={update}
                onMove={(ids, category) => stage(ids, kind, category)}
              />
            </TabsContent>
          ))}
        </Tabs>
      </SettingsSection>
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent>
          <DialogTitle>
            Create {tab === "course" ? "course" : "update"} category
          </DialogTitle>
          <DialogDescription>
            Give this category a name. Empty categories stay hidden from
            readers.
          </DialogDescription>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              try {
                const name = categoryName(
                  newName,
                  settings.contentCategories[tab],
                );
                update({
                  ...settings.contentCategories,
                  [tab]: [...settings.contentCategories[tab], name],
                });
                setQueries((current) => ({ ...current, [tab]: "" }));
                setCreate(false);
              } catch (failure) {
                setCreateError((failure as Error).message);
              }
            }}
          >
            <FormField label="Category name">
              <Input
                autoFocus
                value={newName}
                maxLength={80}
                onChange={(event) => {
                  setNewName(event.target.value);
                  setCreateError("");
                }}
              />
            </FormField>
            {createError && (
              <Alert variant="destructive" role="alert" className="mt-3">
                {createError}
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreate(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!newName.trim()}>
                Create category
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryList({
  kind,
  categories,
  drafts,
  published,
  busy,
  query,
  onClearSearch,
  onChange,
  onMove,
}: {
  kind: CategoryKind;
  categories: ContentCategories;
  drafts: Content[];
  published: Content[];
  busy: boolean;
  query: string;
  onClearSearch: () => void;
  onChange: (categories: ContentCategories) => void;
  onMove: (ids: string[], category: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [transfer, setTransfer] = useState<{
    name?: string;
    ids: string[];
    deleting: boolean;
  } | null>(null);
  const [destination, setDestination] = useState("");
  const [creatingDestination, setCreatingDestination] = useState(false);
  const [destinationName, setDestinationName] = useState("");
  const [transferError, setTransferError] = useState("");
  const [rename, setRename] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState("");
  const { confirm } = useInteractionDialog();
  const names =
    kind === "brief"
      ? [...categories[kind]].sort((a, b) => a.localeCompare(b))
      : categories[kind];
  const search = query.trim().toLowerCase();
  const visibleNames = names.filter((name) =>
    name.toLowerCase().includes(search),
  );
  const reorderDisabled = busy || !!search || kind !== "course";
  const reorder = useRowReorder(
    names.map((name) => ({ id: name })),
    (name, index) => {
      const next = [...categories.course];
      next.splice(next.indexOf(name), 1);
      next.splice(index, 0, name);
      onChange({ ...categories, course: next });
    },
    reorderDisabled,
    (item) => item.id,
  );
  function step(name: string, offset: number) {
    if (reorderDisabled) return;
    const next = [...categories.course],
      index = next.indexOf(name),
      target = index + offset;
    if (target < 0 || target >= next.length) return;
    next.splice(index, 1);
    next.splice(target, 0, name);
    onChange({ ...categories, course: next });
  }
  function openTransfer(ids: string[], name?: string, deleting = false) {
    setDestination("");
    setCreatingDestination(false);
    setDestinationName("");
    setTransferError("");
    setTransfer({ ids, name, deleting });
  }
  async function remove(name: string, items: Content[]) {
    if (items.length)
      return openTransfer(
        items.map((item) => item.id),
        name,
        true,
      );
    if (
      await confirm(`Delete empty category “${name}”?`, {
        submitLabel: "Delete category",
        destructive: true,
      })
    )
      onChange({
        ...categories,
        [kind]: categories[kind].filter((item) => item !== name),
      });
  }
  const invalid = categoryItems(drafts, published, kind, undefined, categories);
  function contentRows(items: Content[], name: string) {
    return (
      <ul aria-label={`Items in ${name}`} className="grid gap-2 ps-3 sm:ps-8">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex min-w-0 items-start gap-3 rounded-lg border border-border px-3 py-2"
          >
            <Checkbox
              aria-label={`Select ${item.title || "Untitled item"}`}
              disabled={busy}
              checked={selected.includes(item.id)}
              onCheckedChange={(checked) =>
                setSelected((current) =>
                  checked
                    ? [...new Set([...current, item.id])]
                    : current.filter((id) => id !== item.id),
                )
              }
            />
            <div className="min-w-0 flex-1 text-copy [overflow-wrap:anywhere]">
              {item.title || "Untitled item"}
            </div>
            <PublicationStatus published={!!item.publishedRevision} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="grid min-w-0 gap-3">
      {selected.length > 0 && (
        <div
          role="region"
          aria-label="Selected category items"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface p-3"
        >
          <span className="text-copy">{selected.length} selected</span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setSelected([])}
            >
              Clear selection
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => openTransfer(selected)}
            >
              Move to category…
            </Button>
          </div>
        </div>
      )}
      <ul aria-label={`${labels[kind]} categories`} className="grid gap-3">
        {visibleNames.map((name) => {
          const index = names.indexOf(name);
          const items = categoryItems(drafts, published, kind, name),
            open = expanded.has(name);
          const toggle = () =>
            setExpanded((current) => {
              const next = new Set(current);
              next.has(name) ? next.delete(name) : next.add(name);
              return next;
            });
          return (
            <Fragment key={name}>
              <ReorderRow
                data-category={name}
                data-dragging={reorder.active === name}
                data-sortable-preview
                data-drop={
                  reorder.destination?.id === name
                    ? reorder.destination.side
                    : undefined
                }
                data-moved={reorder.recentlyMoved === name}
                onDragOver={(event) => reorder.over(event, name)}
                onDrop={reorder.drop}
                onDragEnd={reorder.cancel}
                handle={
                  kind === "course" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      draggable={!reorderDisabled}
                      disabled={reorderDisabled}
                      aria-label={`Reorder ${name}`}
                      title="Drag to reorder, or use the arrow keys"
                      onDragStart={(event) => reorder.start(event, name)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "ArrowUp" ||
                          event.key === "ArrowDown"
                        ) {
                          event.preventDefault();
                          step(name, event.key === "ArrowUp" ? -1 : 1);
                        }
                      }}
                    >
                      <GripVertical aria-hidden="true" />
                    </Button>
                  ) : null
                }
                icon={<Tag size={16} />}
                title={
                  <strong className="[overflow-wrap:anywhere]">{name}</strong>
                }
                detail={`${items.length} ${items.length === 1 ? (kind === "course" ? "course" : "update") : labels[kind].toLowerCase()}`}
                compactActions
                actions={
                  <>
                    {items.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        aria-expanded={open}
                        aria-label={`${open ? "Collapse" : "Expand"} ${name}`}
                        onClick={toggle}
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
                          disabled={busy}
                          aria-label={`Actions for ${name}`}
                        >
                          <MoreHorizontal aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {kind === "course" && (
                          <>
                            <DropdownMenuItem
                              disabled={reorderDisabled || index === 0}
                              onSelect={() => step(name, -1)}
                            >
                              Move up
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                reorderDisabled || index === names.length - 1
                              }
                              onSelect={() => step(name, 1)}
                            >
                              Move down
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem
                          onSelect={() => {
                            setRename(name);
                            setRenameName(name);
                            setRenameError("");
                          }}
                        >
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!items.length}
                          onSelect={() =>
                            openTransfer(
                              items.map((item) => item.id),
                              name,
                            )
                          }
                        >
                          Move all items to…
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => void remove(name, items)}
                        >
                          Delete category
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                }
              />
              {open && items.length > 0 && <li>{contentRows(items, name)}</li>}
            </Fragment>
          );
        })}
      </ul>
      {!names.length && (
        <EmptyState>
          No {kind === "course" ? "course" : "update"} categories yet. Create a
          category to get started.
        </EmptyState>
      )}
      {names.length > 0 && !visibleNames.length && (
        <EmptyState>
          <div className="grid justify-items-center gap-3">
            <p>No categories match your search.</p>
            <Button type="button" variant="outline" onClick={onClearSearch}>
              Clear search
            </Button>
          </div>
        </EmptyState>
      )}
      {invalid.length > 0 && (
        <div className="grid gap-3">
          <p className="text-copy text-muted-foreground">
            These items need an existing category. Select them and choose Move
            to category…
          </p>
          {contentRows(invalid, "items needing a category")}
        </div>
      )}
      <Dialog
        open={!!transfer}
        onOpenChange={(open) => {
          if (!open) setTransfer(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {transfer?.deleting ? "Delete category" : "Move to category"}
          </DialogTitle>
          <DialogDescription>
            {transfer?.deleting
              ? `Move ${transfer.ids.length} ${transfer.ids.length === 1 ? "item" : "items"} from “${transfer.name}” before permanently deleting the category.`
              : `Choose a category for ${transfer?.ids.length || 0} selected items.`}{" "}
            Draft and published categories change together; other edits are
            preserved.
          </DialogDescription>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!transfer) return;
              try {
                const target = creatingDestination
                  ? categoryName(destinationName, categories[kind])
                  : destination;
                if (!target) throw new Error("Choose a destination category.");
                const nextNames = creatingDestination
                  ? [...categories[kind], target]
                  : categories[kind];
                onChange({
                  ...categories,
                  [kind]: transfer.deleting
                    ? nextNames.filter((name) => name !== transfer.name)
                    : nextNames,
                });
                onMove(transfer.ids, target);
                setSelected([]);
                setTransfer(null);
              } catch (failure) {
                setTransferError((failure as Error).message);
              }
            }}
          >
            {creatingDestination ? (
              <FormField label="New category name">
                <Input
                  autoFocus
                  maxLength={80}
                  value={destinationName}
                  onChange={(event) => {
                    setDestinationName(event.target.value);
                    setTransferError("");
                  }}
                />
              </FormField>
            ) : (
              <FormField label="Destination category">
                <SelectField
                  value={destination}
                  onValueChange={(value) => {
                    setDestination(value);
                    setTransferError("");
                  }}
                >
                  <option value="">Choose a category…</option>
                  {names
                    .filter((name) => name !== transfer?.name)
                    .map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                </SelectField>
              </FormField>
            )}
            <Button
              type="button"
              variant="link"
              className="mt-2"
              onClick={() => {
                setCreatingDestination(!creatingDestination);
                setTransferError("");
              }}
            >
              {creatingDestination
                ? "Choose an existing category"
                : "Create a destination category"}
            </Button>
            {transferError && (
              <Alert variant="destructive" role="alert" className="mt-3">
                {transferError}
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTransfer(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={transfer?.deleting ? "destructive" : "default"}
                disabled={
                  creatingDestination ? !destinationName.trim() : !destination
                }
              >
                {transfer?.deleting
                  ? "Move items and delete category"
                  : "Move items"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={rename !== null}
        onOpenChange={(open) => {
          if (!open) setRename(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Rename category</DialogTitle>
          <DialogDescription>
            The new name applies to drafts and published content when you save
            settings.
          </DialogDescription>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (rename === null) return;
              try {
                const name = categoryName(renameName, categories[kind], rename);
                const items = categoryItems(drafts, published, kind, rename);
                onChange({
                  ...categories,
                  [kind]: categories[kind].map((item) =>
                    item === rename ? name : item,
                  ),
                });
                onMove(
                  items.map((item) => item.id),
                  name,
                );
                setRename(null);
              } catch (failure) {
                setRenameError((failure as Error).message);
              }
            }}
          >
            <FormField label="Category name">
              <Input
                autoFocus
                maxLength={80}
                value={renameName}
                onChange={(event) => {
                  setRenameName(event.target.value);
                  setRenameError("");
                }}
              />
            </FormField>
            {renameError && (
              <Alert variant="destructive" role="alert" className="mt-3">
                {renameError}
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRename(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!renameName.trim()}>
                Rename category
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
