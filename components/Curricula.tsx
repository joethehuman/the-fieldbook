"use client";
import { Badge } from "./ui/badge";
import { Note } from "@/components/ui/note";
import { FormField } from "@/components/patterns/form-field";
import { useToast } from "./ui/toast";
import { SelectField } from "./ui/select";
import { useRevealTarget } from "./patterns/use-reveal-target";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { SectionHeader, EmptyState } from "@/components/patterns/layout";
import { ActionGroup } from "@/components/ui/action-group";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useEffect, useState } from "react";
import type { Workspace } from "@/lib/store";
import type { Curriculum } from "@/lib/types";
import { groupItems } from "@/lib/learning-groups";
import { OrderedLearning } from "./patterns/ordered-learning";
import { Button } from "./ui/button";
import { useInteractionDialog } from "./ui/interaction-dialog";

export default function Curricula({
  data,
  onChange,
  onEditingChange,
}: {
  onEditingChange?: (editing: boolean) => void;
  data: Workspace;
  onChange: (data: Workspace) => void | Promise<void>;
}) {
  const destination = useRevealTarget<HTMLElement>();
  const notify = useToast();
  const [editing, setEditing] = useState<Curriculum | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm } = useInteractionDialog();
  useEffect(() => {
    onEditingChange?.(!!editing);
  }, [!!editing, onEditingChange]);
  const all = data.curricula || [];
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
          { ...editing, name },
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
            <OrderedLearning
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
            <FormField label="Find a course">
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the course library"
              />
            </FormField>
            <div className="learning-search-results">
              {content
                .filter(
                  (c) =>
                    c.kind === "course" &&
                    c.status === "published" &&
                    !editing.courseIds.includes(c.id) &&
                    (c.title + " " + c.category)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .map((c) => (
                  <div className="learning-search-result" key={c.id}>
                    <span>
                      <strong>{c.title}</strong>
                      <small>{c.category}</small>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={`Add ${c.title}`}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          courseIds: [...editing.courseIds, c.id],
                        })
                      }
                    >
                      Add
                    </Button>
                  </div>
                ))}
            </div>
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
                  if (await confirm("Discard unsaved curriculum changes?")) {
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
          >
            <Button
              onClick={() => {
                setEditing({
                  id: crypto.randomUUID(),
                  name: "",
                  description: "",
                  courseIds: [],
                  status: "draft",
                });
                destination.reveal();
                setQuery("");
                setNotice("");
              }}
            >
              Create curriculum
            </Button>
          </SectionHeader>
          <div className="group-grid">
            {all.map((c) => (
              <Card className="flex flex-col p-0 sm:p-0" key={c.id}>
                <CardContent className="grid gap-4">
                  <Badge
                    variant={c.status === "published" ? "success" : "default"}
                  >
                    {c.status}
                  </Badge>
                  <h3>{c.name}</h3>
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
                        setEditing(structuredClone(c));
                        destination.reveal();
                        setQuery("");
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
        </>
      )}
    </section>
  );
}
