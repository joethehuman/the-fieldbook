"use client";
import {
  CollectionControls,
  CollectionEmpty,
} from "./patterns/collection-controls";
import { DetailNavigation } from "./patterns/detail-navigation";
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
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/patterns/layout";
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
import { Plus, GraduationCap, Users } from "lucide-react";
import { RecordName, RecordValues } from "./patterns/record-row";
import { RecordCardFooter, RecordCardDetail } from "./patterns/record-card";
import { RowActions, type RowAction } from "./patterns/row-actions";
import { audienceOptions, contentAudienceKey } from "@/lib/content-audiences";
import { useLearningAssignmentPicker } from "./use-learning-assignment-picker";
import { LearningAssignmentPicker } from "./LearningAssignmentPicker";
import { assignmentAudiences } from "@/lib/assignment-audiences";
import { useNestedNavigationGuard } from "./patterns/use-nested-navigation-guard";
import {
  isOrganizationChangeCanceled,
  type OrganizationChangeOptions,
} from "@/lib/organization-change";

export default function Curricula({
  initialCurriculum,
  createNew,
  onDestinationChange,
  hrefForCurriculum,
  data,
  onChange,
  onUpload,
  registerNavigationGuard,
  onPrepareAssignments,
}: {
  hrefForCurriculum?: (id: string) => string;
  initialCurriculum?: string;
  createNew?: boolean;
  onDestinationChange?: (id?: string, create?: boolean) => Promise<boolean>;
  registerNavigationGuard?: RegisterNavigationGuard;
  onPrepareAssignments?: () => Promise<Workspace>;
  data: Workspace;
  onChange: (
    data: Workspace,
    options?: OrganizationChangeOptions,
  ) => void | Promise<void>;
  onUpload?: UploadMedia;
}) {
  const destination = useRevealTarget<HTMLElement>();
  const notify = useToast();
  const [editing, setEditing] = useState<Curriculum | null>(() =>
    createNew
      ? {
          id: crypto.randomUUID(),
          name: "",
          description: "",
          courseIds: [],
          status: "draft",
        }
      : structuredClone(
          data.curricula?.find((item) => item.id === initialCurriculum) || null,
        ),
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [status, setStatus] = useState("all");
  const clearFilters = () => {
    setQuery("");
    setStatus("all");
  };
  const { confirm } = useInteractionDialog();
  const savedCurriculum = useRef<Curriculum | null>(
    editing ? structuredClone(editing) : null,
  );
  const dirty = !!editing && !equalJson(editing, savedCurriculum.current);
  const guard = useRef(async () => true);
  guard.current = async () =>
    !busy && (!dirty || (await confirm("Discard unsaved curriculum changes?")));
  const registerAssignmentGuard = useNestedNavigationGuard(
    () => guard.current(),
    dirty || busy,
    registerNavigationGuard,
  );

  const assignmentPicker = useLearningAssignmentPicker({
    data,
    onChange,
    onPrepare: onPrepareAssignments,
    registerNavigationGuard: registerAssignmentGuard,
  });
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
  const visibleCurricula = all
    .filter(
      (curriculum) =>
        (status === "all" || curriculum.status === status) &&
        `${curriculum.name} ${curriculum.description}`
          .toLowerCase()
          .includes(search),
    )
    .sort(
      (a, b) =>
        (sort === "reverse"
          ? b.name.localeCompare(a.name)
          : a.name.localeCompare(b.name)) || a.id.localeCompare(b.id),
    );
  const selection = useBulkSelection(
    editing?.id || `curricula:${search}:${status}`,
    editing ? editing.courseIds : visibleCurricula.map((c) => c.id),
  );
  const content = data.publishedContent || data.content;
  const assignmentOptions = audienceOptions(data);
  const savedAudiences = assignmentAudiences(data);
  const linked = (id: string) =>
    savedAudiences.filter((audience) =>
      audience.items.some(
        (item) => item.kind === "curriculum" && item.id === id,
      ),
    );
  async function closeEditor() {
    if (await guard.current()) {
      if (onDestinationChange) {
        await onDestinationChange();
        return;
      }
      setEditing(null);
      destination.reveal();
      setNotice("");
    }
  }
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
        curricula: (() => {
          const updated = {
            ...editing,
            name,
            cardArt:
              editing.cardArt ||
              (all.some((c) => c.id === editing.id)
                ? undefined
                : resolvedCardArt(editing.id, name)),
          };
          return all.some((c) => c.id === editing.id)
            ? all.map((c) => (c.id === editing.id ? updated : c))
            : [...all, updated];
        })(),
      });
      if (onDestinationChange) await onDestinationChange();
      setEditing(null);
      destination.reveal();
      setNotice("");
      notify("Curriculum saved.");
    } catch (e) {
      if (!isOrganizationChangeCanceled(e)) setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(c: Curriculum) {
    setBusy(true);
    try {
      await onChange(
        {
          ...data,
          teams: data.teams?.map((team) => ({
            ...team,
            learningItems: team.learningItems?.filter(
              (item) => item.kind !== "curriculum" || item.id !== c.id,
            ),
          })),
          curricula: all.filter((x) => x.id !== c.id),
          groups: data.groups.map((g) => ({
            ...g,
            learningItems: groupItems(g, content).filter(
              (i) => i.kind !== "curriculum" || i.id !== c.id,
            ),
          })),
        },
        {
          review: {
            title: `Delete ${c.name}?`,
            description:
              "Its team and group links are removed. Course content and saved completion stay available.",
            confirmLabel: "Delete curriculum",
            always: true,
          },
        },
      );
      setNotice("");
      notify("Curriculum deleted. Learning history preserved.");
    } catch (e) {
      if (!isOrganizationChangeCanceled(e)) setNotice((e as Error).message);
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
      {assignmentPicker.picker}
      {notice && <Alert variant="destructive">{notice}</Alert>}
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FieldGroup disabled={busy}>
            <DetailNavigation
              disabled={busy}
              items={[{ label: "Back to curricula", onSelect: closeEditor }]}
              current={editing.name || "New curriculum"}
            />
            <SectionHeader
              variant="page"
              title={
                <h2>
                  {all.some((c) => c.id === editing.id)
                    ? "Edit curriculum"
                    : "New curriculum"}
                </h2>
              }
              description="A course list, in the order you recommend."
            >
              <Button type="button" variant="outline" onClick={closeEditor}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                {busy ? "Saving…" : "Save curriculum"}
              </Button>
            </SectionHeader>
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
              description="Published curricula are available in the library and can be added to teams or groups."
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
                Saving updates {linked(editing.id).length} teams or groups. New
                courses join their assigned learning lists; existing completions
                are preserved. Remove assignment links before returning this
                curriculum to draft.
              </Note>
            )}
          </FieldGroup>
        </form>
      ) : (
        <>
          <SectionHeader
            variant="page"
            title={<h2>Curricula</h2>}
            description={
              <>
                Create reusable course lists, then add them to teams or groups.
              </>
            }
          />
          <CollectionControls
            search={
              <FormField
                className="min-w-0 basis-64 flex-1"
                label="Find curricula"
                visuallyHiddenLabel
              >
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find curricula"
                />
              </FormField>
            }
            actions={
              <Button
                type="button"
                onClick={() => {
                  if (onDestinationChange) {
                    void onDestinationChange(undefined, true);
                    return;
                  }
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
            }
            sortLabel={sort === "name" ? "Name A–Z" : "Name Z–A"}
            sort={
              <FormField label="Sort curricula">
                <SelectField value={sort} onValueChange={setSort}>
                  <option value="name">Name A–Z</option>
                  <option value="reverse">Name Z–A</option>
                </SelectField>
              </FormField>
            }
            filters={[
              ...(query
                ? [
                    {
                      id: "query",
                      label: `Search: ${query}`,
                      onRemove: () => setQuery(""),
                    },
                  ]
                : []),
              ...(status !== "all"
                ? [
                    {
                      id: "status",
                      label: status === "published" ? "Published" : "Draft",
                      onRemove: () => setStatus("all"),
                    },
                  ]
                : []),
            ]}
            onClear={clearFilters}
          >
            <FormField label="Status">
              <SelectField value={status} onValueChange={setStatus}>
                <option value="all">All statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </SelectField>
            </FormField>
          </CollectionControls>
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
                  : "Return these curricula to draft. Remove their team and group links first. Course history is preserved.",
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
                      "Remove team and group links before unpublishing these curricula.",
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
              ...curriculumGroupCommands(
                data,
                selection.actionIds,
                onChange,
                assignmentPicker.open,
              ),
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
            {visibleCurricula.map((c) => {
              const edit = () => {
                if (onDestinationChange) {
                  void onDestinationChange(c.id);
                  return;
                }
                savedCurriculum.current = structuredClone(c);
                setEditing(structuredClone(c));
                destination.reveal();
                setNotice("");
              };
              const audiences = linked(c.id).map((audience) => {
                const option = assignmentOptions.find(
                  (item) =>
                    contentAudienceKey(item) ===
                    `${audience.kind}:${audience.id}`,
                );
                return option?.organization
                  ? "Everyone in the organization"
                  : option?.publicGuests
                    ? "Public guests"
                    : audience.name;
              });
              const actions = (assign?: () => void, loading = false) => (
                <RowActions
                  label={c.name}
                  disabled={busy || loading}
                  actions={
                    [
                      { label: "Edit curriculum", onSelect: edit },
                      ...(assign
                        ? [{ label: "Edit audience", onSelect: assign }]
                        : []),
                      {
                        label: "Delete curriculum",
                        onSelect: () => void remove(c),
                        destructive: true,
                        separator: true,
                      },
                    ] satisfies RowAction[]
                  }
                />
              );
              const footer = (assign?: () => void, loading = false) => (
                <RecordCardFooter actions={actions(assign, loading)}>
                  <RecordCardDetail icon={<GraduationCap aria-hidden="true" />}>
                    {c.courseIds.length}{" "}
                    {c.courseIds.length === 1 ? "course" : "courses"}
                  </RecordCardDetail>
                  <RecordCardDetail icon={<Users aria-hidden="true" />}>
                    <RecordValues
                      values={audiences}
                      label="audiences"
                      empty={
                        c.status === "published"
                          ? "No audience assigned"
                          : "Publish to assign an audience"
                      }
                    />
                  </RecordCardDetail>
                </RecordCardFooter>
              );
              return (
                <Card className="flex flex-col p-0 sm:p-0" key={c.id}>
                  <CardContent className="grid gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <Badge
                        variant={
                          c.status === "published" ? "success" : "default"
                        }
                      >
                        {c.status === "published" ? "Published" : "Draft"}
                      </Badge>
                      {selection.canSelect && (
                        <Checkbox
                          aria-label={`Select ${c.name}`}
                          checked={selection.selected.includes(c.id)}
                          onCheckedChange={(v) =>
                            selection.toggle(c.id, v === true)
                          }
                        />
                      )}
                    </div>
                    <h3>
                      <RecordName
                        disabled={busy}
                        href={hrefForCurriculum?.(c.id)}
                        onNavigate={edit}
                        onClick={edit}
                      >
                        {c.name}
                      </RecordName>
                    </h3>
                    <p>{c.description}</p>
                  </CardContent>
                  {c.status === "published" ? (
                    <LearningAssignmentPicker
                      data={data}
                      item={{ kind: "curriculum", id: c.id }}
                      title={c.name}
                      onChange={onChange}
                      onPrepare={onPrepareAssignments}
                      registerNavigationGuard={registerAssignmentGuard}
                      compact
                      renderTrigger={({ onClick, loading }) =>
                        footer(onClick, loading)
                      }
                    />
                  ) : (
                    footer()
                  )}
                </Card>
              );
            })}
          </div>
          <CollectionEmpty
            count={visibleCurricula.length}
            total={all.length}
            noun="curricula"
            onClear={clearFilters}
          />
        </>
      )}
    </section>
  );
}
