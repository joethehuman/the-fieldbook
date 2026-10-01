"use client";
import { DetailNavigation } from "../patterns/detail-navigation";
import { CreatableCombobox } from "../ui/creatable-combobox";
import { DocSectionPicker } from "../DocSectionPicker";
import DocSectionCreate from "../DocSectionCreate";
import { WritingEditor } from "../patterns/writing-editor";
import { EditorFrame, EditorDetailsGroup, type DetailsReveal } from "../patterns/editor-frame";
import { revealEditorTarget } from "../patterns/reveal-editor-target";
import { hasMissingImageAlt } from "@/lib/markdown-compatibility";
import { createDraftSaveQueue, type SaveIntent } from "@/lib/draft-save-queue";
import { contentSignature, hasUnpublishedEdits } from "@/lib/demo-publication";
import { PublicationStatus } from "../patterns/publication-status";
import { FieldDescription } from "../ui/field";
import { FormField } from "@/components/patterns/form-field";
import { useToast } from "../ui/toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/choice";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useInteractionDialog } from "../ui/interaction-dialog";
import LearningGroups from "../LearningGroups";
import { type LearningHandler } from "../Assignments";
import { availableDocSections, createDocSection, sectionForDoc, type DocSection } from "@/lib/docs-navigation";
import { defaultSettings } from "@/lib/settings";
import { useEffect, useRef, useState } from "react";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import { ActionGroup } from "../ui/action-group";
import { GroupPicker } from "../patterns/group-picker";
import { Button } from "../ui/button";
import { Plus, ArrowLeft } from "lucide-react";
import { CardArtEditor } from "../patterns/card-art-editor";
import { graphemeCount, resolvedCardArt } from "@/lib/card-art";
import { type UploadMedia } from "../MarkdownEditor";
import { CourseBuilder } from "../CourseBuilder";
import { requiresPassing, validQuestion } from "@/lib/course-quiz";
import { videoSource } from "@/lib/video";
import type { Workspace } from "@/lib/store";
import { type Content } from "@/lib/types";
const id = () => crypto.randomUUID();
export default function ContentEditor({
  onLearningMany,
  onWorkspaceChange,
  onLearning,
  content,
  data,
  onSave,
  onCancel,
  onUpload,
  registerNavigationGuard,
  onReload,
}: {
  onUpload?: UploadMedia;
  registerNavigationGuard?: RegisterNavigationGuard;
  onReload?: () => Promise<Workspace>;
  production?: boolean;
  content: Content;
  data: Workspace;
  onSave: (c: Content, intent?: SaveIntent) => Content | void | Promise<Content | void>;
  onCancel: () => void;
  onLearning?: LearningHandler;
  onLearningMany?: (
    actions: import("@/lib/learning").LearningAction[],
  ) => Promise<void>;
  onWorkspaceChange?: (
    data: Workspace,
    options?: { locallyHandled?: boolean },
  ) => void | Promise<void>;
}) {
  const notify = useToast();
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [detailsReveal, setDetailsReveal] = useState<DetailsReveal>();
  const [revealStep, setRevealStep] = useState<{ id: string; request: number; target?: "title" | "body"; questionId?: string }>();
  const [c, setC] = useState<Content>(() => ({
      ...content,
      assignments:
        content.kind !== "course"
          ? []
          : (content.assignments ??
            content.groups.map((groupId) => ({
              groupId,
              assignedAt: content.createdAt || content.updatedAt,
              due: { type: "none" },
            }))),
    })),
    [editorTab, setEditorTab] = useState("content"),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(false),
    [saving, setSaving] = useState(false),
    [uploadCount, setUploadCount] = useState(0);
  const { confirm } = useInteractionDialog();
  const baseline = useRef(c);
  const original = useRef(content);
  const pendingUploads = useRef(0);
  const savingNow = useRef(false);
  const publishingNow = useRef(false);
  const [publishing, setPublishing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const busy = uploadCount > 0 || recovering;
  const current = useRef(c);
  current.current = c;
  const callbacks = useRef({ onSave, data, refresh });
  callbacks.current = { onSave, data, refresh };
  const queue = useRef<ReturnType<typeof createDraftSaveQueue> | null>(null);
  if (!queue.current) queue.current = createDraftSaveQueue({
    initial: c,
    idleMs: 900,
    read: () => current.current,
    save: async (snapshot, intent) => {
      const latest = callbacks.current.data.content.find((item) => item.id === snapshot.id);
      const saved: Content = {
        ...snapshot,
        status: intent,
        assignments: latest?.assignments || snapshot.assignments,
        groups: snapshot.kind === "course" ? latest?.groups || snapshot.groups : snapshot.groups,
        version: intent === "published" && callbacks.current.refresh
          ? original.current.version + 1 : original.current.version,
      };
      savingNow.current = true;
      setSaving(true);
      return (await callbacks.current.onSave(saved, intent)) || saved;
    },
    acknowledge: (persisted, snapshot, intent) => {
      original.current = persisted;
      baseline.current = persisted;
      const next = contentSignature(current.current) === contentSignature(snapshot)
        ? persisted
        : { ...current.current, revision: persisted.revision, publishedRevision: persisted.publishedRevision,
            publishedSignature: persisted.publishedSignature, version: persisted.version };
      current.current = next;
      setC(next);
      if (intent === "published") {
        callbacks.current.refresh = false;
        setRefresh(false);
        notify(`${persisted.kind === "doc" ? "Doc" : persisted.kind === "brief" ? "Update" : "Course"} published.`);
      }
      setSavedMessage("Saved");
    },
    failed: (failure) => setError((failure as Error).message),
  });
  const signature = contentSignature(c);
  const observedSignature = useRef(signature);
  if (observedSignature.current !== signature) {
    observedSignature.current = signature;
    queue.current.markEdited();
  }
  const dirty = signature !== contentSignature(baseline.current);
  const needsRecovery = queue.current.blocked;
  async function flushDraft(intent: SaveIntent = "draft") {
    if (pendingUploads.current || recovering) return false;
    const result = await queue.current!.flush(intent);
    savingNow.current = false;
    setSaving(false);
    return result;
  }
  useEffect(() => {
    if (!dirty || busy || queue.current!.blocked) return;
    const timer = setTimeout(() => { void flushDraft(); }, 900);
    return () => clearTimeout(timer);
  }, [c, dirty, busy, saving]);
  useEffect(() => {
    const target = heading.current;
    if (!target) return;
    const viewport = target.closest<HTMLElement>(".main-content");
    const measure = () => {
      const height = Math.ceil(target.getBoundingClientRect().height);
      const sticky = height <= (viewport?.clientHeight || window.innerHeight) / 2;
      form.current?.style.setProperty("--editor-header-height", `${sticky ? height : 0}px`);
      target.dataset.sticky = String(sticky);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    if (viewport) observer.observe(viewport);
    return () => observer.disconnect();
  }, [editorTab]);
  const guard = useRef(async () => true);
  guard.current = async () => {
    if (pendingUploads.current || recovering) return false;
    if (!queue.current!.blocked && (queue.current!.dirty() || savingNow.current)) {
      if (await flushDraft()) return true;
    }
    return (!queue.current!.dirty() && !queue.current!.blocked) || await confirm(
      "Leave with unsaved changes? Cancel to keep editing or download your draft before leaving. Changes already saved are kept.",
    );
  };
  useEffect(() => {
    registerNavigationGuard?.(() => guard.current(), {
      protected: dirty || busy || saving || needsRecovery,
    });
    return () => registerNavigationGuard?.(null);
  }, [registerNavigationGuard, dirty, busy, saving, needsRecovery]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || busy || saving || needsRecovery) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, busy, saving, needsRecovery]);
  const upload: UploadMedia | undefined = onUpload
    ? async (file) => {
        pendingUploads.current++;
        setUploadCount(pendingUploads.current);
        try {
          return await onUpload(file);
        } finally {
          pendingUploads.current--;
          setUploadCount(pendingUploads.current);
        }
      }
    : undefined;
  function downloadDraft() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              ...c,
              version: refresh ? original.current.version + 1 : c.version,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "fieldbook-unsaved-draft.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  async function reloadSaved() {
    if (!onReload || busy || savingNow.current) return;
    setRecovering(true);
    try {
      const latest = (await onReload()).content.find(
        (item) => item.id === c.id,
      );
      if (!latest) {
        queue.current!.reset(original.current);
        setError("");
        setSavedMessage("No saved copy found. Saving your draft again.");
        return;
      }
      if (
        !(await confirm(
          "Replace the open edits with the latest saved copy? Cancel to keep your edits. Download your draft first if you need to compare or reapply changes.",
        ))
      )
        return;
      original.current = latest;
      baseline.current = latest;
      current.current = latest;
      queue.current!.reset(latest);
      setC(latest);
      setRefresh(false);
      setError("");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setRecovering(false);
    }
  }
  const [createdSections, setCreatedSections] = useState<DocSection[] | null>(
    null,
  );
  const [creatingSection, setCreatingSection] = useState(false);
  const docSections = availableDocSections(
    [...data.content, ...(data.publishedContent || [])].filter(
      (item) => item.kind === "doc",
    ),
    data.settings?.docCategoryOrder,
    createdSections || data.settings?.docSections,
  );
  const existing = data.content.some((x) => x.id === c.id);
  type Requirement = { id: string; message: string; field?: string; step?: string; questionId?: string; target?: "title" | "body" };
  const requirements: Requirement[] = [];
  if (!c.title.trim()) requirements.push({ id: "title", message: "Add a title", field: "editor-title" });
  if (!c.summary.trim()) requirements.push({ id: "summary", message: "Add a short description", field: "writing-summary" });
  if (!c.category.trim() || (c.kind === "doc" && !sectionForDoc(c, docSections)))
    requirements.push({ id: "organization", message: c.kind === "doc" ? "Choose a Docs section" : "Choose a category", field: "writing-organization" });
  if (c.kind !== "doc") {
    const art = resolvedCardArt(c.id, c.title, c.cardArt, c.coverImageUrl);
    if ((art.source === "generated" && !art.shortTitle.trim()) || graphemeCount(art.shortTitle.trim()) > 40)
      requirements.push({ id: "art-title", message: "Give artwork a short title of up to 40 characters", field: "content-artwork-title" });
    if (art.source === "upload" && !art.imageUrl)
      requirements.push({ id: "art-image", message: "Upload a card image", field: "content-artwork" });
  }
  if (c.kind === "course") {
    if (!c.lessons.length) requirements.push({ id: "lessons", message: "Add a lesson", step: "outline" });
    for (const [index, lesson] of c.lessons.entries()) {
      const label = `Lesson ${index + 1}`;
      if (!lesson.title.trim()) requirements.push({ id: `${lesson.id}-title`, message: `${label}: add a title`, step: lesson.id, target: "title" });
      if (!lesson.body.trim() && !lesson.videoUrl) requirements.push({ id: `${lesson.id}-body`, message: `${label}: add content`, step: lesson.id, target: "body" });
      if (lesson.videoUrl && !videoSource(lesson.videoUrl)) requirements.push({ id: `${lesson.id}-video`, message: `${label}: use a supported HTTPS video URL`, step: lesson.id });
      if (hasMissingImageAlt(lesson.body)) requirements.push({ id: `${lesson.id}-alt`, message: `${label}: add image alternative text`, step: lesson.id, target: "body" });
    }
    for (const [index, question] of c.questions.entries())
      if (!validQuestion(question)) requirements.push({ id: question.id, message: `Quiz question ${index + 1}: complete the question and answers`, step: "quiz", questionId: question.id });
    const live = data.publishedContent?.find((item) => item.id === c.id);
    if (!refresh && live && requiresPassing(c) !== requiresPassing(live))
      requirements.push({ id: "version", message: "Publish a new version for the changed completion rule", field: "course-version" });
  }
  function revealRequirement(item: Requirement) {
    if (item.step) {
      setRevealStep({ id: item.step, request: Date.now(), target: item.target, questionId: item.questionId });
    } else if (item.field?.startsWith("editor-")) {
      const field = document.getElementById(item.field);
      if (field) revealEditorTarget(field);
    } else {
      setDetailsReveal((current) => ({ request: (current?.request || 0) + 1, field: item.field }));
    }
  }
  const requirement = requirements[0];
  const publicationChanged = !c.publishedRevision || hasUnpublishedEdits(c, data.publishedContent?.find((item) => item.id === c.id)) || refresh;
  async function submit(e: React.FormEvent, intent: SaveIntent = "published") {
    e.preventDefault();
    if (busy || queue.current!.blocked || publishingNow.current) return;
    if (intent === "published" && requirement) {
      revealRequirement(requirement);
      return;
    }
    setError("");
    if (intent === "published") {
      publishingNow.current = true;
      setPublishing(true);
    }
    try { await flushDraft(intent); }
    finally {
      if (intent === "published") {
        publishingNow.current = false;
        setPublishing(false);
      }
    }
  }
  const set = (key: string, value: unknown) =>
    setC((prev) => ({ ...prev, [key]: value }));
  const details = (
    <FieldGroup disabled={busy} className="editor-details-content">
      <EditorDetailsGroup id="writing-readiness" title="Before publishing">
        {requirements.length ? <ul className="grid gap-2">
          {requirements.map((item) => <li key={item.id}>
            <Button type="button" variant="link" size="sm" className="h-auto justify-start whitespace-normal p-0 text-left font-normal"
              onClick={() => revealRequirement(item)}>{item.message}</Button>
          </li>)}
        </ul> : <p className="text-copy text-muted-foreground">{publicationChanged ? "Ready to publish." : "Published version is current."}</p>}
        <FieldDescription>Drafts save automatically. Publish when ready for readers.</FieldDescription>
      </EditorDetailsGroup>
      <EditorDetailsGroup id="writing-summary" title="Short description">
        <FormField label="Short description" visuallyHiddenLabel>
          <Textarea id="editor-summary" size="compact" rows={3} maxLength={300} value={c.summary}
            onChange={(event) => set("summary", event.target.value)}
            placeholder={c.kind === "course" ? "What will people learn?" : "What will people find here?"} />
        </FormField>
      </EditorDetailsGroup>
      <EditorDetailsGroup id="writing-organization" title={c.kind === "doc" ? "Docs section" : "Category"}>
        {c.kind === "doc" ? (
          <>
            <DocSectionPicker
              sections={docSections}
              value={sectionForDoc(c, docSections)?.id || ""}
              disabled={busy}
              onChange={(sectionId) => {
                const chosen = docSections.find(
                  (item) => item.id === sectionId,
                )!;
                const parent = docSections.find(
                  (item) => item.id === chosen.parentId,
                );
                setC((current) => ({
                  ...current,
                  sectionId,
                  category: parent?.name || chosen.name,
                  folder: parent ? chosen.name : "",
                }));
              }}
            />
            <Button
              type="button"
              disabled={busy}
              onClick={() => setCreatingSection((open) => !open)}
            >
              <Plus aria-hidden="true" />
              {creatingSection
                ? "Close section form"
                : "Create section"}
            </Button>
            {creatingSection && (
              <DocSectionCreate
                sections={docSections}
                disabled={busy || !onWorkspaceChange}
                onCancel={() => setCreatingSection(false)}
                onCreate={async (section) => {
                  if (!onWorkspaceChange)
                    throw new Error(
                      "Section settings are unavailable.",
                    );
                  const next = createDocSection(
                    docSections,
                    section.name,
                    section.parentId,
                    section.id,
                  );
                  await onWorkspaceChange({
                    ...data,
                    settings: {
                      ...defaultSettings,
                      ...data.settings,
                      docSections: next,
                      docCategoryOrder: [],
                    },
                  });
                  setCreatedSections(next);
                  const parent = next.find(
                    (item) => item.id === section.parentId,
                  );
                  setC((current) => ({
                    ...current,
                    sectionId: section.id,
                    category: parent?.name || section.name,
                    folder: parent ? section.name : "",
                  }));
                  setCreatingSection(false);
                }}
              />
            )}
          </>
        ) : (
          <FormField label="Category" visuallyHiddenLabel>
            <CreatableCombobox
              value={c.category}
              onValueChange={(value) => set("category", value)}
              options={data.content
                .filter((item) => item.kind === c.kind)
                .map((item) => item.category)}
              listLabel="Categories"
              placeholder="Choose or add category…"
            />
          </FormField>
        )}

      </EditorDetailsGroup>
      {c.kind === "brief" && <EditorDetailsGroup id="writing-relevance" title="Relevant groups"
        description="Groups guide recommendations. Everyone allowed into the installation can still read this update.">
        <GroupPicker groups={data.groups} showDescription={false} value={c.groups} onChange={(groups) => set("groups", groups)} />
      </EditorDetailsGroup>}
      {c.kind !== "doc" && <div id="content-artwork" className="editor-details-group">
        <CardArtEditor id={c.id} title={c.title} kind={c.kind} category={c.category} art={c.cardArt}
          shortTitleId="content-artwork-title"
          legacyCover={c.coverImageUrl} settings={data.settings} onUpload={upload} disabled={busy} saveMode="automatic"
          onChange={(cardArt) => setC((current) => ({ ...current, cardArt,
            ...(current.kind === "course" && cardArt.source === "upload" && cardArt.imageUrl ? { coverImageUrl: cardArt.imageUrl } : {}),
          }))} />
      </div>}
      {c.kind === "course" && <>
        <EditorDetailsGroup id="course-duration" title="Course details">
          <FormField label="Estimated minutes"><Input type="number" min={1} max={600} value={c.duration}
            onChange={(event) => set("duration", Number(event.target.value))} /></FormField>
        </EditorDetailsGroup>
        {existing && <EditorDetailsGroup id="course-version" title="Publishing">
          <Field orientation="horizontal"><Checkbox checked={refresh} disabled={saving} aria-describedby="course-version-help"
            onCheckedChange={(checked) => setRefresh(checked === true)} />
            Publish a new version and start a new completion window
          </Field>
          <FieldDescription id="course-version-help">Current version: {c.version}. Keep this unchecked for minor corrections.</FieldDescription>
        </EditorDetailsGroup>}
        <EditorDetailsGroup id="course-assignments" title="Learning groups"
          description="Groups assign courses; completion windows are managed in organization settings.">
          {existing && (data.publishedContent ?? data.content).some((item) => item.id === c.id && item.status === "published") && onLearning
            ? <Button type="button" variant="outline" size="sm" onClick={async () => {
                if (await guard.current()) setEditorTab("assignments");
              }}>Manage learning groups</Button>
            : <p className="text-copy text-muted-foreground">Publish this course to add it to a group’s assigned courses.</p>}
        </EditorDetailsGroup>
      </>}
      <Collapsible>
        <CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm" className="justify-start">Draft recovery</Button></CollapsibleTrigger>
        <CollapsibleContent className="grid gap-3 pt-3">
          <FieldDescription>Download a recovery copy or review the latest saved draft before replacing your open edits.</FieldDescription>
          <Button type="button" variant="outline" size="sm" onClick={downloadDraft}>Download draft</Button>
          {onReload && <Button type="button" variant="outline" size="sm" disabled={busy || saving} onClick={() => void reloadSaved()}>Review saved copy</Button>}
        </CollapsibleContent>
      </Collapsible>
    </FieldGroup>
  );
  if (editorTab === "assignments" && onLearning)
    return (
      <>
        <Button variant="link" onClick={() => setEditorTab("content")}>
          <ArrowLeft size={16} />
          Back to course builder
        </Button>
        <h1>{c.title}</h1>
        {onWorkspaceChange && (
          <LearningGroups
            data={data}
            onChange={onWorkspaceChange}
            onLearningMany={onLearningMany}
            onLearning={onLearning}
          />
        )}
      </>
    );
  return (
    <form
      ref={form}
      className="editor"
      onSubmit={(event) => void submit(event, "draft")}
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          void submit(event, "draft");
        }
      }}
    >
      <div ref={heading} className="editor-heading">
        <h1 className="sr-only">{c.kind === "doc" ? "Doc" : c.kind === "brief" ? "Update" : "Course"} editor</h1>
        <DetailNavigation flush disabled={busy} items={[{
          label: "Back to content",
          onSelect: async () => { if (await guard.current()) onCancel(); },
        }]} />
        <div className="editor-heading-actions">
          <div className="editor-save-status">
            <span role="status">
              {saving || busy ? uploadCount ? "Uploading media…" : "Saving…"
                : queue.current!.blocked ? "Save failed"
                : dirty ? "Saving…" : savedMessage || (existing ? "Saved" : "Not saved yet")}
            </span>
            <PublicationStatus published={!!c.publishedRevision} hasUnpublishedChanges={!!c.publishedRevision && publicationChanged} />
          </div>
          <Button type="button" disabled={busy || publishing || queue.current!.blocked || !publicationChanged || requirements.length > 0}
            onClick={(event) => void submit(event, "published")}>
            {!publicationChanged ? "Published" : c.publishedRevision ? "Publish changes" : "Publish"}
          </Button>
        </div>
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <p>{error}</p>
          <ActionGroup className="mt-3">
            <Button type="button" variant="outline" onClick={downloadDraft}>
              Download draft
            </Button>
            {onReload && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={reloadSaved}
              >
                Review saved copy
              </Button>
            )}
          </ActionGroup>
        </Alert>
      )}
      {busy && (
        <p role="status">
          {uploadCount
            ? "Uploading media. Keep this page open until the draft is saved."
            : "Saving or refreshing. Keep this page open."}
        </p>
      )}
      <FieldGroup disabled={busy} className="editor-content">
        <section className="editor-introduction" aria-label={c.kind === "course" ? "Course introduction" : "Content introduction"}>
          <FormField label="Title" visuallyHiddenLabel>
            <Input id="editor-title" variant="title" maxLength={160} value={c.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder={`Untitled ${c.kind === "doc" ? "doc" : c.kind === "brief" ? "update" : "course"}`} />
          </FormField>
        </section>
        {c.kind === "course" ? (
          <CourseBuilder course={c} details={details} requirementsCount={requirements.length} revealDetails={detailsReveal}
            incompleteSteps={[...new Set(requirements.flatMap((item) => item.step ? [item.step] : []))]}
            revealStep={revealStep} onChange={(updater) => setC(updater)} onUpload={upload} disabled={busy} />
        ) : (
          <EditorFrame details={details} requirementsCount={requirements.length} revealDetails={detailsReveal} disabled={busy}>
            <WritingEditor label={c.kind === "doc" ? "Doc content" : "Update content"} value={c.body}
              onChange={(value) => set("body", value)} onUpload={upload} disabled={busy} />
          </EditorFrame>
        )}
      </FieldGroup>
    </form>
  );
}
