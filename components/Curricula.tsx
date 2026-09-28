"use client";
import { BulkActions } from "./patterns/bulk-actions";
import { SelectRows, useBulkSelection } from "./patterns/bulk-selection";
import { Checkbox } from "./ui/choice";
import { curriculumGroupCommands } from "./bulk-relationships";
import { BulkPicker } from "./patterns/bulk-selection";
import { Badge } from "./ui/badge";
import { Note } from "@/components/ui/note";
import { FormField } from "@/components/patterns/form-field";
import { useToast } from "./ui/toast";
import { SelectField } from "./ui/select";
import { useRevealTarget } from "./patterns/use-reveal-target";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { SectionHeader, EmptyState, Toolbar } from "@/components/patterns/layout";
import { ActionGroup } from "@/components/ui/action-group";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useEffect, useRef, useState } from "react";
import type { Workspace } from "@/lib/store";
import type { Curriculum } from "@/lib/types";
import { equalJson } from "@/lib/equal-json";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import { groupItems } from "@/lib/learning-groups";
import { OrderedLearning } from "./patterns/ordered-learning";
import { Button } from "./ui/button";
import { CardArtEditor } from "./patterns/card-art-editor";
import { graphemeCount, resolvedCardArt } from "@/lib/card-art";
import type { UploadMedia } from "./MarkdownEditor";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { Plus } from "lucide-react";

export default function Curricula({
  data,
  onChange,
  onUpload,
  registerNavigationGuard,
}: {
  registerNavigationGuard?: RegisterNavigationGuard;
  data: Workspace;
  onChange: (data: Workspace) => void | Promise<void>;
  onUpload?: UploadMedia;
}) {
  const destination = useRevealTarget<HTMLElement>();
  const notify = useToast();
  const [editing, setEditing] = useState<Curriculum | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const { confirm } = useInteractionDialog();
  const savedCurriculum = useRef<Curriculum | null>(null);
  const dirty = !!editing && !equalJson(editing, savedCurriculum.current);
  const guard = useRef(async () => true);
  guard.current = async () =>
    !busy && (!dirty || (await confirm("Discard unsaved curriculum changes?")));
  useEffect(() => {
    registerNavigationGuard?.(() => guard.current());
    return () => registerNavigationGuard?.(null);
  }, [registerNavigationGuard]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, busy]);
  const all = data.curricula || [];
  const search = query.trim().toLowerCase();
  const visibleCurricula = all.filter((curriculum) =>
    `${curriculum.name} ${curriculum.description}`.toLowerCase().includes(search),
  );
  const selection = useBulkSelection(
    editing?.id || `curricula:${search}`,
    editing ? editing.courseIds : visibleCurricula.map((c) => c.id),
  );
  const content = data.publishedContent || data.content;
  const linked = (id: string) =>
    data.groups.filter((g) =>
      groupItems(g, content).some(
        (i) => i.kind === "curriculum" && i.id === id,
      ),
    );
  async function save() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      setNotice("Give the curriculum a name.");
      return;
    }
    const art = resolvedCardArt(editing.id, name, editing.cardArt);
    if (
      art.source === "generated" &&
      (!art.shortTitle.trim() || graphemeCount(art.shortTitle.trim()) > 40)
    ) {
      setNotice("Give generated artwork a short title of up to 40 characters.");
      return;
    }
    if (
      all.some(
        (c) =>
          c.id !== editing.id && c.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setNotice("That curriculum name already exists.");
      return;
    }
    if (editing.status === "published" && !editing.courseIds.length) {
      setNotice("Add at least one course before publishing.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await onChange({
        ...data,
        curricula: [
          ...all.filter((c) => c.id !== editing.id),
          {
            ...editing,
            name,
            cardArt:
              editing.cardArt ||
              (all.some((c) => c.id === editing.id)
                ? undefined
                : resolvedCardArt(editing.id, name)),
          },
        ],
      });
      setEditing(null);
      destination.reveal();
      setNotice("");
      notify("Curriculum saved.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(c: Curriculum) {
    if (
      !(await confirm(
        `Delete ${c.name}? It will be removed from ${linked(c.id).length} learning groups. Course content and completion history are preserved.`,
      ))
    )
      return;
    setBusy(true);
    try {
      await onChange({
        ...data,
        curricula: all.filter((x) => x.id !== c.id),
        groups: data.groups.map((g) => ({
          ...g,
          learningItems: groupItems(g, content).filter(
            (i) => i.kind !== "curriculum" || i.id !== c.id,
          ),
        })),
      });
      setNotice("");
      notify("Curriculum deleted. Learning history preserved.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      {...destination.targetProps}
      aria-label={editing ? "Curriculum editor" : "Curricula"}
      className="learning-admin"
    >
      {notice && <Alert variant="destructive">{notice}</Alert>}
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FieldGroup disabled={busy}>
            <h2>
              {all.some((c) => c.id === editing.id)
                ? "Edit curriculum"
                : "New curriculum"}
            </h2>
            <p>A playlist of courses, in the order you recommend.</p>
            <FormField label="Name">
              <Input
                required
                maxLength={80}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </FormField>
            <FormField label="Description">
              <Textarea
                maxLength={1000}
                rows={2}
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </FormField>
            <CardArtEditor
              id={editing.id}
              title={editing.name}
              kind="curriculum"
              art={editing.cardArt}
              settings={data.settings}
              onUpload={onUpload}
              disabled={busy}
              onBusyChange={setBusy}
              onChange={(cardArt) => setEditing({ ...editing, cardArt })}
            />
            <ActionGroup>
              <BulkPicker
                title="Add courses"
                description="Append selected courses in the picker’s listed order. Save the curriculum to apply your changes."
                options={content
                  .filter(
                    (c) =>
                      c.kind === "course" &&
                      c.status === "published" &&
                      !editing.courseIds.includes(c.id),
                  )
                  .map((c) => ({
                    id: c.id,
                    label: c.title,
                    description: c.category,
                  }))}
                onApply={(ids) =>
                  setEditing({
                    ...editing,
                    courseIds: [...new Set([...editing.courseIds, ...ids])],
                  })
                }
                actionLabel="Add courses"
              />
            </ActionGroup>
            <BulkActions
              singleItemActions={false}
              collectionSize={selection.collectionSize}
              selected={selection.actionIds}
              onSelectionChange={selection.setSelected}
              commands={[
                {
                  id: "remove",
                  label: "Remove from curriculum",
                  successMessage:
                    "Course links removed from this draft. Save the curriculum to apply.",
                  description:
                    "Remove these course links. Course content and history remain. Save the curriculum to apply the changes.",
                  apply: () =>
                    setEditing({
                      ...editing,
                      courseIds: editing.courseIds.filter(
                        (id) => !selection.actionIds.includes(id),
                      ),
                    }),
                },
              ]}
            />
            <OrderedLearning
              selected={selection.selected}
              onSelectionChange={selection.setSelected}
              items={editing.courseIds.map((id) => ({
                id,
                label:
                  content.find((c) => c.id === id)?.title ||
                  "Unavailable course",
                detail:
                  content.find((c) => c.id === id)?.status !== "published"
                    ? "Not currently published"
                    : undefined,
              }))}
              onReorder={(courseIds) => setEditing({ ...editing, courseIds })}
              onRemove={(id) =>
                setEditing({
                  ...editing,
                  courseIds: editing.courseIds.filter((x) => x !== id),
                })
              }
            />
            <FormField
              label="Status"
              description="Published curricula are available in the library and can be added to learning groups."
            >
              <SelectField
                disabled={busy}
                value={editing.status}
                onValueChange={(value) =>
                  setEditing({
                    ...editing,
                    status: value as Curriculum["status"],
                  })
                }
              >
                <option value="draft" disabled={linked(editing.id).length > 0}>
                  Draft
                </option>
                <option value="published">Published</option>
              </SelectField>
            </FormField>
            {!!linked(editing.id).length && (
              <Note>
                Saving updates {linked(editing.id).length} learning groups. New
                courses join their assigned learning lists; existing completions
                are preserved. Remove group links before returning this
                curriculum to draft.
              </Note>
            )}
            <ActionGroup>
              <Button type="submit" loading={busy}>
                {busy ? "Saving…" : "Save curriculum"}
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={async () => {
                  if (await guard.current()) {
                    setEditing(null);
                    destination.reveal();
                    setNotice("");
                  }
                }}
              >
                Cancel
              </Button>
            </ActionGroup>
          </FieldGroup>
        </form>
      ) : (
        <>
          <SectionHeader
            title={<h2>Curricula</h2>}
            description={
              <>Create reusable playlists, then add them to learning groups.</>
            }
          />
          <Toolbar className="items-start">
            <FormField className="min-w-0 basis-64 flex-1" label="Find curricula" visuallyHiddenLabel>
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find curricula"
              />
            </FormField>
            <Button
              type="button"
              onClick={() => {
                const draft: Curriculum = {
                  id: crypto.randomUUID(),
                  name: "",
                  description: "",
                  courseIds: [],
                  status: "draft",
                };
                savedCurriculum.current = draft;
                setEditing(draft);
                destination.reveal();
                setNotice("");
              }}
            >
              <Plus aria-hidden="true" />
              Create curriculum
            </Button>
          </Toolbar>
          <BulkActions
            singleItemActions={false}
            collectionSize={selection.collectionSize}
            selected={selection.actionIds}
            onSelectionChange={selection.setSelected}
            noun="curricula"
            commands={[
              ...([true, false] as const).map((published) => ({
                id: published ? "publish" : "unpublish",
                label: published ? "Publish selected" : "Unpublish selected",
                description: published
                  ? "Make these curricula available in the library. Each must contain published courses."
                  : "Return these curricula to draft. Remove their learning-group links first. Course history is preserved.",
                apply: async () => {
                  if (
                    published &&
                    all.some(
                      (c) =>
                        selection.actionIds.includes(c.id) &&
                        (!c.courseIds.length ||
                          c.courseIds.some(
                            (id) =>
                              !content.some(
                                (p) => p.id === id && p.status === "published",
                              ),
                          )),
                    )
                  )
                    throw new Error(
                      "Each curriculum needs at least one published course and no unavailable courses.",
                    );
                  if (
                    !published &&
                    selection.actionIds.some((id) => linked(id).length)
                  )
                    throw new Error(
                      "Remove learning-group links before unpublishing these curricula.",
                    );
                  await onChange({
                    ...data,
                    curricula: all.map((c) =>
                      selection.actionIds.includes(c.id)
                        ? { ...c, status: published ? "published" : "draft" }
                        : c,
                    ),
                  });
                },
              })),
              ...curriculumGroupCommands(data, selection.actionIds, onChange),
            ]}
          />
          {selection.canSelect && (
            <div className="flex items-center gap-3">
              <SelectRows
                label="Select all curricula"
                ids={visibleCurricula.map((c) => c.id)}
                value={selection.selected}
                onChange={selection.setSelected}
              />
              Select all matching curricula
            </div>
          )}
          <div className="group-grid">
            {visibleCurricula.map((c) => (
              <Card className="flex flex-col p-0 sm:p-0" key={c.id}>
                <CardContent className="grid gap-4">
                  <Badge
                    variant={c.status === "published" ? "success" : "default"}
                  >
                    {c.status}
                  </Badge>
                  <div className="flex items-center gap-3">
                    {selection.canSelect && (
                      <Checkbox
                        aria-label={`Select ${c.name}`}
                        checked={selection.selected.includes(c.id)}
                        onCheckedChange={(v) =>
                          selection.toggle(c.id, v === true)
                        }
                      />
                    )}
                    <h3>{c.name}</h3>
                  </div>
                  <p>{c.description}</p>
                </CardContent>
                <CardFooter className="mt-auto">
                  <p className="text-copy text-muted-foreground">
                    {c.courseIds.length} courses · {linked(c.id).length}{" "}
                    learning groups
                  </p>
                  <ActionGroup>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        savedCurriculum.current = structuredClone(c);
                        setEditing(structuredClone(c));
                        destination.reveal();
                        setNotice("");
                      }}
                    >
                      Edit {c.name}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => remove(c)}
                    >
                      Delete
                    </Button>
                  </ActionGroup>
                </CardFooter>
              </Card>
            ))}
          </div>
          {!all.length && (
            <EmptyState>
              No curricula yet. Create a playlist for onboarding or an ongoing
              learning program.
            </EmptyState>
          )}
          {!!all.length && !visibleCurricula.length && (
            <EmptyState>No curricula match your search.</EmptyState>
          )}
        </>
      )}
    </section>
  );
}
