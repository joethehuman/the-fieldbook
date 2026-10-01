"use client";
import { DetailNavigation } from "./patterns/detail-navigation";
import { Pagination } from "./patterns/pagination";
import { contentRelationshipCommands } from "./bulk-relationships";
import type { BulkHandler } from "@/lib/bulk-actions";
import { AdminBulkActions } from "./AdminBulkActions";
import { PeopleBulkActions } from "./PeopleBulkActions";
import { SelectRows, useBulkSelection } from "./patterns/bulk-selection";
import { type SaveIntent } from "@/lib/draft-save-queue";
import { hasUnpublishedEdits } from "@/lib/demo-publication";
import { PublicationStatus } from "./patterns/publication-status";
import { FormField } from "@/components/patterns/form-field";
import { FilterOptions } from "./patterns/filter-options";
import { useToast } from "./ui/toast";
import { DataTable } from "./patterns/data-table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { CollectionControls, CollectionEmpty } from "./patterns/collection-controls";
import { equalJson } from "@/lib/equal-json";
import { Checkbox } from "@/components/ui/choice";
import { useRevealTarget } from "./patterns/use-reveal-target";
import { TableContainer, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { SectionHeader, CollectionToolbar, Toolbar } from "@/components/patterns/layout";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { SelectField } from "./ui/select";
import { groupItems } from "@/lib/learning-groups";
import { groupPath } from "@/lib/group-hierarchy";
import { teamPath } from "@/lib/team-hierarchy";
import { availableDocSections, sectionForDoc } from "@/lib/docs-navigation";
import { defaultSettings } from "@/lib/settings";
import { OnboardingFields } from "./OnboardingFields";
import { AdminSectionPending } from "./admin/AdminSectionPending";
import { Suspense, lazy, startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { NavigationGuard, RegisterNavigationGuard } from "@/lib/navigation-guard";
import type { RegisterContentNavigation } from "@/lib/navigation-guard";
import { ActionGroup } from "./ui/action-group";
import { GroupPicker } from "./patterns/group-picker";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogDescription } from "./ui/dialog";
import { Tabs, TabsContent } from "./ui/tabs";
import { Plus, X, Save } from "lucide-react";
import { type UploadMedia } from "./MarkdownEditor";
import { SettingsSection } from "./patterns/settings-section";
import type { Workspace } from "@/lib/store";
import { effectiveGroups, type Content, type User } from "@/lib/types";
import type { LearningHandler } from "./Assignments";
import { AdminNavigation, adminSections } from "./admin/AdminNavigation";
import { contentColumns } from "./patterns/panel-pending";
import { AdminContentControls } from "./admin/AdminContentControls";
import { useAdminContentShell } from "./admin/AdminContentShell";
import { prepareAdminCode } from "./admin/section-code";
const SiteSettingsPanel = lazy(() => import("./SiteSettingsPanel"));
const Editor = lazy(() => import("./admin/ContentEditor"));
const RecentlyDeleted = lazy(() => import("./RecentlyDeleted").then(module => ({ default: module.RecentlyDeleted })));
const LearningGroups = lazy(() => import("./LearningGroups"));
const Curricula = lazy(() => import("./Curricula"));
const PendingPeople = lazy(() => import("./PendingPeople").then(module => ({ default: module.PendingPeople })));
const Assignments = lazy(() => import("./Assignments").then(module => ({ default: module.Assignments })));
const FeedbackAdmin = lazy(() => import("./Feedback").then(module => ({ default: module.FeedbackAdmin })));
const TeamsAdmin = lazy(() => import("./TeamManagement").then(module => ({ default: module.TeamsAdmin })));
const TeamProgress = lazy(() => import("./Teams").then(module => ({ default: module.TeamProgress })));
type Props = {
  initialTab?: string;
  routeManaged?: boolean;
  onBulk: BulkHandler;
  data: Workspace;
  user: User;
  onOpenTab?: (tab: string) => Promise<void>;
  onEdit?: (id: string) => Promise<Content>;
  onSaveContent?: (content: Content, intent: SaveIntent) => Promise<Content>;
  onUnpublish?: (id: string) => Promise<void>;
  onChange: (
    d: Workspace,
    options?: { locallyHandled?: boolean },
  ) => void | Promise<void>;
  production?: boolean;
  onLearning?: LearningHandler;
  onUpload?: UploadMedia;
  registerNavigationGuard?: RegisterNavigationGuard;
  registerContentNavigation?: RegisterContentNavigation;
  onReload?: () => Promise<Workspace>;
};
const id = () => crypto.randomUUID();
function AdminContent({
  initialTab = "content",
  routeManaged = false,
  onBulk,
  data,
  user,
  onOpenTab,
  onEdit,
  onSaveContent,
  onUnpublish,
  onChange,
  production = false,
  onUpload,
  onLearning,
  registerNavigationGuard,
  registerContentNavigation,
  onReload,
}: Props) {
  const notify = useToast();
  const { confirm } = useInteractionDialog();
  const adminPanel = useRevealTarget();
  const adminGuard = useRef<NavigationGuard | null>(null);
  const profileNavigationGuard = useRef<NavigationGuard | null>(null);
  const adminProtected = useRef(false);
  const profileProtected = useRef(false);
  const registerAdminGuard = useCallback<RegisterNavigationGuard>(
    (guard, options) => {
      adminGuard.current = guard;
      adminProtected.current = !!options?.protected;
      registerNavigationGuard?.(guard || profileNavigationGuard.current ? async () => {
        if (profileNavigationGuard.current && !(await profileNavigationGuard.current())) return false;
        return guard ? await guard() : true;
      } : null, { protected: adminProtected.current || profileProtected.current });
    },
    [registerNavigationGuard],
  );
  const [tab, setTab] = useState(initialTab),
    [openingTab, setOpeningTab] = useState<string | null>(null),
    [openingItem, setOpeningItem] = useState<string | null>(null),
    [editing, setEditing] = useState<Content | null>(null),
    [person, setPerson] = useState<User | null>(null),
    [notice, setNotice] = useState(""),
    [localFilter, localSetFilter] = useState("all"),
    [localQuery, localSetQuery] = useState(""),
    [localCategory, localSetCategory] = useState("all"),
    [localContentSort, localSetContentSort] = useState("created"),
    [peopleSort, setPeopleSort] = useState("title"),
    [peopleRole, setPeopleRole] = useState("all"),
    [peopleGroup, setPeopleGroup] = useState("all"),
    [peopleTeam, setPeopleTeam] = useState("all"),
    [peopleStatus, setPeopleStatus] = useState("all"),
    [detailScope, setDetailScope] = useState<{
      groupId?: string;
      userId?: string;
    } | null>(null);
  const [localContentStatus, localSetContentStatus] = useState("all"),
    [localContentSection, localSetContentSection] = useState("all"),
    [page, setPage] = useState(1);
  const contentShell = useAdminContentShell();
  const controls = routeManaged && initialTab === "content" ? contentShell : null;
  const filter = controls?.filter ?? localFilter, setFilter = controls?.setFilter ?? localSetFilter;
  const query = controls?.query ?? localQuery, setQuery = controls?.setQuery ?? localSetQuery;
  const category = controls?.category ?? localCategory, setCategory = controls?.setCategory ?? localSetCategory;
  const contentSection = controls?.contentSection ?? localContentSection, setContentSection = controls?.setContentSection ?? localSetContentSection;
  const contentSort = controls?.contentSort ?? localContentSort, setContentSort = controls?.setContentSort ?? localSetContentSort;
  const contentStatus = controls?.contentStatus ?? localContentStatus, setContentStatus = controls?.setContentStatus ?? localSetContentStatus;
  const [personBusy, setPersonBusy] = useState(false);
  const [personError, setPersonError] = useState("");
  const personBaseline = useRef<User | null>(null);
  const personSaving = useRef(false);
  const personDirty = !!person && !equalJson(person, personBaseline.current);
  const personGuard = useRef(async () => true);
  const returningToContent = useRef(false);
  const returnToContent = useCallback(async () => {
    if (tab === "content" && !editing && !detailScope && !person) return true;
    if (returningToContent.current || openingTab || openingItem) return false;
    returningToContent.current = true;
    try {
      if (person && !(await personGuard.current())) return false;
      if (adminGuard.current && !(await adminGuard.current())) return false;
      await onOpenTab?.("content");
      setEditing(null);
      setPerson(null);
      setDetailScope(null);
      setTab("content");
      setQuery("");
      setNotice("");
      document.getElementById("main-content")?.scrollTo({ top: 0 });
      return true;
    } catch (error) {
      setNotice((error as Error).message);
      return false;
    } finally {
      returningToContent.current = false;
    }
  }, [tab, editing, detailScope, person, openingTab, openingItem, onOpenTab]);
  useEffect(() => {
    registerContentNavigation?.(returnToContent);
    return () => registerContentNavigation?.(null);
  }, [returnToContent, registerContentNavigation]);
  personGuard.current = async () => !personSaving.current && (!personDirty || await confirm("Discard unsaved profile changes?"));
  function openPerson(value: User) {
    personBaseline.current = structuredClone(value);
    setPerson(value);
    setPersonError("");
  }
  async function closePerson() { if (await personGuard.current()) setPerson(null); }
  useEffect(() => {
    if (!person) return;
    profileNavigationGuard.current = () => personGuard.current();
    profileProtected.current = personDirty || personBusy;
    registerAdminGuard(adminGuard.current, { protected: adminProtected.current });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (personDirty || personSaving.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      profileNavigationGuard.current = null;
      profileProtected.current = false;
      registerAdminGuard(adminGuard.current, { protected: adminProtected.current });
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [!!person, personDirty, personBusy, registerAdminGuard]);
  const contentRows = data.content
    .filter(
      (c) =>
        (filter === "all" || c.kind === filter) &&
        (contentStatus === "all" ||
          (contentStatus === "published"
            ? !!c.publishedRevision
            : !c.publishedRevision)) &&
        (contentSection === "all" ||
          sectionForDoc(
            c,
            availableDocSections(
              data.content.filter((c) => c.kind === "doc"),
              data.settings?.docCategoryOrder,
              data.settings?.docSections,
            ),
          )?.id === contentSection) &&
        (category === "all" || c.category === category) &&
        `${c.title} ${c.summary} ${c.folder}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      contentSort === "title"
        ? a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
        : contentSort === "created"
          ? (b.createdAt || b.updatedAt).localeCompare(a.createdAt || a.updatedAt) || a.id.localeCompare(b.id)
        : contentSort === "updated"
          ? b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)
          : a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id),
    );
  const peopleRows = data.users
    .filter(
      (u) =>
        `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()) &&
        (peopleTeam === "all" ||
          (peopleTeam === "none" ? !u.teamId : u.teamId === peopleTeam)) &&
        (peopleRole === "all" || u.role === peopleRole) &&
        (peopleGroup === "all" ||
          effectiveGroups(u, data.groups).has(peopleGroup)) &&
        (peopleStatus === "all" || u.active === (peopleStatus === "active")),
    )
    .sort((a, b) =>
      (peopleSort === "reverse"
        ? b.name.localeCompare(a.name)
        : a.name.localeCompare(b.name)) || a.id.localeCompare(b.id),
    );
  const selection = useBulkSelection(
    [
      tab,
      filter,
      query,
      category,
      peopleRole,
      peopleGroup,
      peopleStatus,
      peopleTeam,
      contentStatus,
      contentSection,
    ].join("|"),
    (tab === "people" ? peopleRows : contentRows).map((row) => row.id),
  );
  useEffect(() => {
    setPage(1);
  }, [
    tab,
    filter,
    query,
    category,
    peopleRole,
    peopleGroup,
    peopleStatus,
    peopleTeam,
    contentStatus,
    contentSection,
    contentSort,
    peopleSort,
  ]);
  const clearContentFilters = () => { setQuery(""); setCategory("all"); setContentStatus("all"); setContentSection("all"); setFilter("all"); };
  const clearPeopleFilters = () => { setQuery(""); setPeopleRole("all"); setPeopleGroup("all"); setPeopleStatus("all"); setPeopleTeam("all"); };
  const contentFilters = [
    ...(query ? [{ id: "search", label: `Search: ${query}`, onRemove: () => setQuery("") }] : []),
    ...(category !== "all" ? [{ id: "category", label: `Category: ${category}`, onRemove: () => setCategory("all") }] : []),
    ...(contentStatus !== "all" ? [{ id: "status", label: contentStatus === "published" ? "Published" : "Draft only", onRemove: () => setContentStatus("all") }] : []),
    ...(contentSection !== "all" ? [{ id: "section", label: `Section: ${data.settings?.docSections?.find(section => section.id === contentSection)?.name || contentSection}`, onRemove: () => setContentSection("all") }] : []),
  ];
  const peopleFilters = [
    ...(query ? [{ id: "search", label: `Search: ${query}`, onRemove: () => setQuery("") }] : []),
    ...(peopleRole !== "all" ? [{ id: "role", label: peopleRole === "admin" ? "Administrator" : peopleRole === "manager" ? "Manager" : "Learner", onRemove: () => setPeopleRole("all") }] : []),
    ...(peopleStatus !== "all" ? [{ id: "status", label: peopleStatus === "active" ? "Active" : "Inactive", onRemove: () => setPeopleStatus("all") }] : []),
    ...(peopleGroup !== "all" ? [{ id: "group", label: `Group: ${groupPath(peopleGroup, data.groups)}`, onRemove: () => setPeopleGroup("all") }] : []),
    ...(peopleTeam !== "all" ? [{ id: "team", label: peopleTeam === "none" ? "No team" : teamPath(peopleTeam, data.teams || []), onRemove: () => setPeopleTeam("all") }] : []),
  ];
  const currentPage = Math.min(
    page,
    Math.max(
      1,
      Math.ceil((tab === "people" ? peopleRows : contentRows).length / 25),
    ),
  );
  const contentPage = contentRows.slice(
    (currentPage - 1) * 25,
    currentPage * 25,
  );
  const peoplePage = peopleRows.slice((currentPage - 1) * 25, currentPage * 25);
  const manageLearning: LearningHandler = async (action) => {
    if (onLearning) return onLearning(action);
    const next = structuredClone(data);
    const c = next.content.find((c) => c.id === action.contentId)!;
    if (action.operation === "target" || action.operation === "untarget") {
      c.groups = c.groups.filter((id) => id !== action.groupId);
      if (action.operation === "target") c.groups.push(action.groupId!);
    } else if (
      action.operation === "assign" ||
      action.operation === "unassign"
    ) {
      next.groups = next.groups.map((g) => {
        if (g.id !== action.groupId) return g;
        const items = groupItems(g, next.content).filter(
          (i) => i.kind !== "course" || i.id !== c.id,
        );
        if (action.operation === "assign")
          items.push({ kind: "course", id: c.id });
        return { ...g, learningItems: items };
      });
    } else {
      const list = next.progress[action.userId!] || [];
      next.progress[action.userId!] = [
        ...list.filter((p) => p.content_id !== c.id || p.version !== c.version),
        {
          content_id: c.id,
          version: c.version,
          lessons:
            action.operation === "complete" ? c.lessons.map((l) => l.id) : [],
          passed: action.operation === "complete",
          attempts: [],
          revision: (action.progressExpected || 0) + 1,
        },
      ];
    }
    await onChange(next);
  };
  async function manageLearningMany(
    actions: import("@/lib/learning").LearningAction[],
  ) {
    if (onLearning) {
      const revisions = new Map<string, number>();
      let completed = 0;
      try {
        for (const action of actions) {
          const expected = revisions.get(action.contentId) ?? action.expected;
          await onLearning({ ...action, expected });
          revisions.set(action.contentId, expected + 1);
          completed++;
        }
      } catch (error) {
        throw new Error(
          `${completed} of ${actions.length} relationship changes confirmed. ${(error as Error).message}`,
        );
      }
      return;
    }
    const next = structuredClone(data);
    for (const action of actions) {
      for (const collection of [next.content, next.publishedContent || []]) {
        const c = collection.find((c) => c.id === action.contentId);
        if (c)
          c.groups =
            action.operation === "target"
              ? [...new Set([...c.groups, action.groupId!])]
              : c.groups.filter((id) => id !== action.groupId);
      }
    }
    await onChange(next);
  }

  function create(kind: Content["kind"]) {
    startTransition(() => setEditing({
      id: id(),
      kind,
      title: "",
      summary: "",
      body: "",
      category: "",
      folder: "",
      status: "draft",
      version: 1,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      assignments: [],
      duration: 5,
      groups: [],
      lessons:
        kind === "course" ? [{ id: id(), title: "", body: "" }] : [],
      questions: [],
      ...(kind === "course" ? { requirePassing: false } : {}),
    }));
  }
  useEffect(() => {
    if (!controls) return;
    controls.connect(data, create, !!editing);
    return () => controls.connect(null, null, false);
  }, [data, editing, controls?.connect]);
  async function save(c: Content, intent: SaveIntent = "draft") {
    if (onSaveContent) return onSaveContent(c, intent);
    const old = data.content.find((x) => x.id === c.id);
    const updated = {
      ...c,
      createdAt:
        old?.createdAt ||
        old?.updatedAt ||
        c.createdAt ||
        new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await onChange({
      ...data,
      content: old
        ? data.content.map((x) => (x.id === c.id ? updated : x))
        : [...data.content, updated],
    });

    setNotice("");
    // The server may normalize the draft while saving. Keep the editor's
    // baseline on the persisted revision so a second publish is not treated
    // as a concurrent edit.
    return production && onEdit ? await onEdit(c.id) : updated;
  }
  async function savePerson(e: React.FormEvent) {
    e.preventDefault();
    if (!person || personSaving.current) return;
    setPersonError("");
    if (
      data.users.some(
        (u) =>
          u.id !== person.id &&
          u.email.toLowerCase() === person.email.toLowerCase(),
      )
    ) {
      setPersonError("A profile already uses that email.");
      return;
    }
    const previous = data.users.find((u) => u.id === person.id);
    const savedPerson = {
      ...person,
      groupJoinedAt: Object.fromEntries(
        person.groups.map((g) => [
          g,
          previous?.groups.includes(g)
            ? previous.groupJoinedAt?.[g] || "1970-01-01T00:00:00.000Z"
            : new Date().toISOString(),
        ]),
      ),
    };
    personSaving.current = true;
    setPersonBusy(true);
    try {
      await onChange({
        ...data,
        users: data.users.some((u) => u.id === person.id)
          ? data.users.map((u) => (u.id === person.id ? savedPerson : u))
          : [...data.users, savedPerson],
      });
      setPerson(null);
      setNotice("");
      notify(production ? "Account saved." : "Demo profile saved.");
    } catch (e) {
      setPersonError((e as Error).message);
    } finally {
      personSaving.current = false;
      setPersonBusy(false);
    }
  }
  if (editing)
    return (
      <Editor
        key={editing.id}
        content={editing}
        data={data}
        onSave={save}
        onCancel={() => setEditing(null)}
        onUpload={onUpload}
        production={production}
        onLearning={manageLearning}
        onLearningMany={manageLearningMany}
        onWorkspaceChange={onChange}
        registerNavigationGuard={registerAdminGuard}
        onReload={onReload}
      />
    );
  const detailPerson = data.users.find((u) => u.id === detailScope?.userId);
  const detailView = detailScope && (
    <div className="grid gap-4">
      <DetailNavigation items={[{ label: detailScope.userId ? "Back to people" : "Back to learning groups", onSelect: () => { setDetailScope(null); adminPanel.reveal(); } }]} current={detailPerson?.name} />
      {detailScope.groupId ? <LearningGroups data={data} onChange={onChange} onLearning={manageLearning} onLearningMany={manageLearningMany} initialGroup={detailScope.groupId} /> : <>
        <SectionHeader variant="page" title={<h2>{detailPerson?.name}</h2>} description={detailPerson?.email} />
        <Assignments key={detailScope.userId} data={data} scope={detailScope} onAction={manageLearning} onChange={onChange} onOpenGroup={(groupId) => startTransition(() => setDetailScope({ groupId }))} />
      </>}
    </div>
  );

  async function changeAdminTab(next: string) {
    if ((next === tab && !detailScope) || (adminGuard.current && !(await adminGuard.current())))
      return;
    if (openingTab) return;
    if (onOpenTab) {
      setOpeningTab(next);
      try {
        await Promise.all([prepareAdminCode(next), onOpenTab(next)]);
      } catch (error) {
        setNotice((error as Error).message);
        setOpeningTab(null);
        return;
      }
      setOpeningTab(null);
    }
    startTransition(() => {
      setTab(next);
      setDetailScope(null);
      setNotice("");
      setQuery("");
    });
    adminPanel.reveal(false);
  }
  return (
    <div className="admin-workspace" aria-busy={!!openingTab}>
      {!routeManaged && <h1 className="sr-only">Administration</h1>}
      {openingTab && (
        <span className="sr-only" role="status">
          Loading administration data
        </span>
      )}
      <Tabs
        className={routeManaged ? "contents" : "admin-layout"}
        orientation="vertical"
        value={tab}
        onValueChange={changeAdminTab}
      >
{!routeManaged && <AdminNavigation tab={tab} production={production} onIntent={(next) => { void prepareAdminCode(next).catch(() => {}); }} onValueChange={changeAdminTab} />}
        <TabsContent
          {...adminPanel.targetProps}
          tabIndex={0}
          value={tab}
          className={routeManaged ? "mt-0" : "admin-panel mt-0"}
          key={tab}
        >
          <>
          {!(routeManaged && tab === "content") && !detailScope && !["groups", "curricula", "progress", "feedback", "teams"].includes(
            tab,
          ) && (
            <SectionHeader
              variant="page"
              title={
                <h2>
                  {
                    tab === "people" && !production ? "Demo profiles" : adminSections
                      .flatMap((s) => s.items)
                      .find((s) => s.id === tab)?.name
                  }
                </h2>
              }
              description={
                <>
                  {
                    adminSections
                      .flatMap((s) => s.items)
                      .find((s) => s.id === tab)?.description
                  }
                </>
              }
            >
                {tab === "people" && !production && (
                  <Button
                    variant="default"
                    onClick={() =>
                      openPerson({
                        id: id(),
                        name: "",
                        email: "",
                        role: "learner",
                        onboardingStart:
                          data.settings?.newUserStage === "newhire"
                            ? new Date().toISOString().slice(0, 10)
                            : undefined,
                        groups: [],
                        active: true,
                      })
                    }
                  >
                    <Plus size={16} />
                    Add demo profile
                  </Button>
                )}
            </SectionHeader>
          )}
          {notice && <Alert variant="destructive">{notice}</Alert>}
          {detailView ? detailView : tab === "deleted" ? (
            <RecentlyDeleted data={data} onBulk={onBulk} />
          ) : tab.startsWith("settings-") ? (
            <SiteSettingsPanel
              key={tab}
              section={
                tab.slice(9) as import("./SiteSettingsPanel").SettingsSection
              }
              registerNavigationGuard={registerAdminGuard}
              data={data}
              onChange={onChange}
              production={production}
            />
          ) : tab === "feedback" ? (
            <FeedbackAdmin data={data} />
          ) : tab === "teams" ? (
            <TeamsAdmin
              data={data}
              onChange={onChange}
              registerNavigationGuard={registerAdminGuard}
            />
          ) : tab === "content" ? (
            <>
              {!routeManaged && <AdminContentControls filter={filter} query={query} category={category} contentSection={contentSection} contentSort={contentSort} contentStatus={contentStatus} setFilter={setFilter} setQuery={setQuery} setCategory={setCategory} setContentSection={setContentSection} setContentSort={setContentSort} setContentStatus={setContentStatus} data={data} create={create} contentFilters={contentFilters} clearContentFilters={clearContentFilters} />}
              <AdminBulkActions
                data={data}
                collectionSize={selection.collectionSize}
                range={
                  contentRows.length
                    ? `${(currentPage - 1) * 25 + 1}–${Math.min(currentPage * 25, contentRows.length)} of ${contentRows.length} shown`
                    : undefined
                }
                selected={selection.actionIds}
                onSelectionChange={selection.setSelected}
                onBulk={onBulk}
                extraCommands={contentRelationshipCommands(
                  data,
                  selection.actionIds,
                  onChange,
                  manageLearningMany,
                )}
              />
              {!!contentRows.length && <TableContainer>
                <DataTable layout="contentSelection">
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {selection.canSelect && (
                          <SelectRows
                            label={
                              contentRows.length > contentPage.length
                                ? `Select page (${contentPage.length})`
                                : `Select all ${contentRows.length}`
                            }
                            ids={contentPage.map((row) => row.id)}
                            value={selection.selected}
                            onChange={selection.setSelected}
                          />
                        )}
                      </TableHead>
                      <TableHead>{contentColumns[1]}</TableHead>
                      <TableHead>{contentColumns[2]}</TableHead>
                      <TableHead>{contentColumns[3]}</TableHead>
                      <TableHead>{contentColumns[4]}</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contentPage.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          {selection.canSelect && (
                            <Checkbox
                              aria-label={`Select ${c.title || "Untitled"}`}
                              checked={selection.selected.includes(c.id)}
                              onCheckedChange={(v) =>
                                selection.toggle(c.id, v === true)
                              }
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <strong>{c.title || "Untitled"}</strong>
                          <small>
                            {c.category}
                            {c.folder ? " / " + c.folder : ""}
                          </small>
                        </TableCell>
                        <TableCell>
                          {c.kind === "doc"
                            ? "Doc"
                            : c.kind === "brief"
                              ? "Update"
                              : "Course"}
                        </TableCell>
                        <TableCell>
                          <PublicationStatus
                            published={!!c.publishedRevision}
                            hasUnpublishedChanges={hasUnpublishedEdits(
                              c,
                              production
                                ? undefined
                                : data.publishedContent?.find(
                                    (live) => live.id === c.id,
                                  ),
                            )}
                          />
                        </TableCell>
                        <TableCell>v{c.version}</TableCell>
                        <TableCell>
                          <ActionGroup variant="text">
                            <Button
                              variant="link"
                              disabled={openingItem === c.id}
                              onClick={async () => {
                                if (!onEdit) {
                                  startTransition(() => setEditing(structuredClone(c)));
                                  return;
                                }
                                setOpeningItem(c.id);
                                try {
                                  const [item] = await Promise.all([onEdit(c.id), prepareAdminCode("editor")]);
                                  startTransition(() => setEditing(item));
                                  setNotice("");
                                } catch (error) {
                                  setNotice((error as Error).message);
                                } finally {
                                  setOpeningItem(null);
                                }
                              }}
                            >
                              {openingItem === c.id ? "Opening…" : "Edit"}
                            </Button>

                            {!!c.publishedRevision && (
                              <Button
                                variant="link"
                                onClick={async () => {
                                  if (
                                    !(await confirm(
                                      "Unpublish this item? Its draft and history will be kept.",
                                    ))
                                  )
                                    return;
                                  try {
                                    if (onUnpublish) await onUnpublish(c.id);
                                    else
                                      await onChange({
                                        ...data,
                                        content: data.content.filter(
                                          (x) => x.id !== c.id,
                                        ),
                                      });
                                    setNotice("");
                                    notify("Content unpublished.");
                                  } catch (e) {
                                    setNotice((e as Error).message);
                                  }
                                }}
                              >
                                Unpublish
                              </Button>
                            )}
                          </ActionGroup>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              </TableContainer>}
              <CollectionEmpty count={contentRows.length} total={data.content.length} noun="content items" onClear={clearContentFilters} />
              <Pagination
                label="Content"
                showCount={false}
                page={currentPage}
                pageSize={25}
                total={contentRows.length}
                onPageChange={setPage}
              />
              {contentRows.length > 25 &&
                selection.selected.length > 0 &&
                selection.selected.length < contentRows.length && (
                  <Button
                    variant="link"
                    onClick={() =>
                      selection.setSelected(contentRows.map((row) => row.id))
                    }
                  >
                    Select all {contentRows.length} matching items
                  </Button>
                )}
            </>
          ) : tab === "people" ? (
            <>
              <Collapsible>
                <CollapsibleTrigger asChild><Button type="button" variant="outline">New user defaults</Button></CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
              <SettingsSection
                id="new-users"
                title={<h2>New users</h2>}
                guidance="Changes save immediately. Applies to newly added users and new self-registrations. You can override the stage and start date for each person. Group membership still determines assigned courses."
              >
                <FormField label="Default onboarding stage for new users">
                  <SelectField
                    aria-describedby="new-users-guidance"
                    value={data.settings?.newUserStage || "existing"}
                    onValueChange={async (value) => {
                      try {
                        await onChange({
                          ...data,
                          settings: {
                            ...defaultSettings,
                            ...data.settings,
                            newUserStage: value as "existing" | "newhire",
                          },
                        });
                        setNotice("");
                        notify("Default saved. Existing people are unchanged.");
                      } catch (error) {
                        setNotice((error as Error).message);
                      }
                    }}
                  >
                    <option value="existing">
                      Existing user — stay current
                    </option>
                    <option value="newhire">
                      New user — onboarding window
                    </option>
                  </SelectField>
                </FormField>
              </SettingsSection>
                </CollapsibleContent>
              </Collapsible>
              {production && <PendingPeople data={data} onChange={onChange} registerNavigationGuard={registerAdminGuard} />}
              <Toolbar>
                <p className="muted">
                  {production
                    ? "Manage signed-in accounts. Deactivation preserves course history. Clear managed teams before removing a manager’s access."
                    : "Sample profiles for trying role-based assignments. No accounts or emails are created."}
                </p>

              </Toolbar>
              <CollectionControls
                filters={peopleFilters}
                onClear={clearPeopleFilters}
                sortLabel={peopleSort === "reverse" ? "Name Z–A" : "Name A–Z"}
                sort={
                <FormField label="Sort profiles">
                  <SelectField
                    value={peopleSort}
                    onValueChange={setPeopleSort}
                  >
                    <option value="title">Name A–Z</option>
                    <option value="reverse">Name Z–A</option>
                  </SelectField>
                </FormField>
                }
                search={
                  <FormField label="Search profiles" visuallyHiddenLabel>
                    <Input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search profiles by name or email"
                    />
                  </FormField>
                }
              >
                <FormField label="Role">
                  <SelectField
                    value={peopleRole}
                    onValueChange={(value) => setPeopleRole(value)}
                  >
                    <option value="all">All roles</option>
                    <option value="learner">Learner</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </SelectField>
                </FormField>
                <FormField label="Group">
                  <SelectField
                    value={peopleGroup}
                    onValueChange={(value) => setPeopleGroup(value)}
                  >
                    <option value="all">All groups</option>
                    {data.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {groupPath(g.id, data.groups)}
                      </option>
                    ))}
                  </SelectField>
                </FormField>
                <FormField label="Profile status">
                  <SelectField
                    value={peopleStatus}
                    onValueChange={(value) => setPeopleStatus(value)}
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </SelectField>
                </FormField>

                <FormField label="Reporting team">
                  <SelectField value={peopleTeam} onValueChange={setPeopleTeam}>
                    <option value="all">All teams</option>
                    <option value="none">No team</option>
                    {(data.teams || []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamPath(t.id, data.teams || [])}
                      </option>
                    ))}
                  </SelectField>
                </FormField>
              </CollectionControls>
              <PeopleBulkActions
                currentUserId={user.id}
                data={data}
                collectionSize={selection.collectionSize}
                range={
                  peopleRows.length
                    ? `${(currentPage - 1) * 25 + 1}–${Math.min(currentPage * 25, peopleRows.length)} of ${peopleRows.length} shown`
                    : undefined
                }
                selected={selection.actionIds}
                onChange={onChange}
                onSelectionChange={selection.setSelected}
                onBulk={onBulk}
              />
              {!!peopleRows.length && <TableContainer>
                <DataTable layout="peopleSelection">
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {selection.canSelect && (
                          <SelectRows
                            label={
                              peopleRows.length > peoplePage.length
                                ? `Select page (${peoplePage.length})`
                                : `Select all ${peopleRows.length}`
                            }
                            ids={peoplePage.map((row) => row.id)}
                            value={selection.selected}
                            onChange={selection.setSelected}
                          />
                        )}
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead>Groups</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {peoplePage.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          {selection.canSelect && (
                            <Checkbox
                              aria-label={`Select ${u.name}`}
                              checked={selection.selected.includes(u.id)}
                              onCheckedChange={(v) =>
                                selection.toggle(u.id, v === true)
                              }
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <strong>{u.name}</strong>
                          <small>{u.email}</small>
                        </TableCell>
                        <TableCell>{u.role === "admin" ? "Administrator" : u.role === "manager" ? "Manager" : "Learner"}</TableCell>
                        <TableCell>
                          {data.groups
                            .filter((g) =>
                              effectiveGroups(u, data.groups).has(g.id),
                            )
                            .map((g) => g.name)
                            .join(", ") || "No groups"}
                        </TableCell>
                        <TableCell>
                          {u.active ? "Active" : "Inactive"}
                        </TableCell>
                        <TableCell>
                          <ActionGroup variant="text">
                            <Button
                              variant="link"
                              onClick={() => openPerson(structuredClone(u))}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="link"
                              onPointerEnter={() => { void prepareAdminCode("assignments").catch(() => {}); }}
                              onFocus={() => { void prepareAdminCode("assignments").catch(() => {}); }}
                              onClick={() => { startTransition(() => setDetailScope({ userId: u.id })); adminPanel.reveal(); }}
                            >
                              Courses & progress
                            </Button>
                          </ActionGroup>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              </TableContainer>}
              <CollectionEmpty count={peopleRows.length} total={data.users.length} noun={production ? "people" : "demo profiles"} onClear={clearPeopleFilters} />
              <Pagination
                label="People"
                showCount={false}
                page={currentPage}
                pageSize={25}
                total={peopleRows.length}
                onPageChange={setPage}
              />
              {peopleRows.length > 25 &&
                selection.selected.length > 0 &&
                selection.selected.length < peopleRows.length && (
                  <Button
                    variant="link"
                    onClick={() =>
                      selection.setSelected(peopleRows.map((row) => row.id))
                    }
                  >
                    Select all {peopleRows.length} matching items
                  </Button>
                )}
            </>
          ) : tab === "curricula" ? (
            <Curricula
              data={data}
              onChange={onChange}
              onUpload={onUpload}
              registerNavigationGuard={registerAdminGuard}
            />
          ) : tab === "groups" ? (
            <LearningGroups
              data={data}
              onChange={onChange}
              onLearning={manageLearning}
              onLearningMany={manageLearningMany}
            />
          ) : (
            <TeamProgress data={data} user={user} />
          )}
          </>
        </TabsContent>
      </Tabs>
      <Dialog
        open={!!person}
        onOpenChange={(open) => {
          if (!open) void closePerson();
        }}
      >
        {person && (
          <DialogContent className="profile-dialog">
            <form className="profile-form" onSubmit={savePerson}>
              <FieldGroup disabled={personBusy}>
              <Button
                variant="ghost"
                type="button"
                size="icon"
                className="absolute top-3 right-3"
                aria-label="Close profile editor"
                onClick={closePerson}
              >
                <X />
              </Button>
              <DialogTitle>
                {production ? "Account" : "Demo profile"}
              </DialogTitle>
              <DialogDescription>
                {production
                  ? "Changes apply to this verified account. Login email is read-only."
                  : "Use fictional details. This does not create a secure account."}
              </DialogDescription>
              {personError && <Alert variant="destructive">{personError}</Alert>}
              {personDirty && <p role="status" className="text-caption text-muted-foreground">Unsaved changes</p>}
              <FormField label="Name">
                <Input
                  required
                  maxLength={80}
                  value={person.name}
                  onChange={(e) =>
                    setPerson({ ...person, name: e.target.value })
                  }
                />
              </FormField>
              <FormField label={production ? "Login email" : "Email label"}>
                <Input
                  type="email"
                  required
                  disabled={production}
                  value={person.email}
                  onChange={(e) =>
                    setPerson({ ...person, email: e.target.value })
                  }
                />
              </FormField>
              <OnboardingFields
                value={person.onboardingStart}
                onChange={(onboardingStart) =>
                  setPerson({ ...person, onboardingStart })
                }
              />
              <FormField label="Access">
                <SelectField
                  disabled={person.id === user.id}
                  value={person.role}
                  onValueChange={(value) =>
                    setPerson({ ...person, role: value as User["role"] })
                  }
                >
                  <option value="learner">Learner</option>
                  <option value="admin">Administrator</option>
                  <option value="manager">Manager</option>
                </SelectField>
              </FormField>
              <FormField label="Reporting team">
                <SelectField
                  value={person.teamId || ""}
                  onValueChange={(value) =>
                    setPerson({ ...person, teamId: value || undefined })
                  }
                >
                  <option value="">No team</option>
                  {(data.teams || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {teamPath(t.id, data.teams || [])}
                    </option>
                  ))}
                </SelectField>
              </FormField>
              <GroupPicker
                groups={data.groups}
                value={person.groups}
                onChange={(groups) => setPerson({ ...person, groups })}
              />
              <Field orientation="horizontal">
                <Checkbox
                  disabled={person.id === user.id}
                  checked={person.active}
                  onCheckedChange={(checked) =>
                    setPerson({ ...person, active: checked === true })
                  }
                />
                Active profile
              </Field>
              <DialogFooter className="justify-end">
                <Button type="button" variant="outline" onClick={closePerson}>Cancel</Button>
                <Button variant="default" loading={personBusy}>
                  <Save size={16} />
                  Save profile
                </Button>
              </DialogFooter>
              </FieldGroup>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

// A section/editor code load keeps the current usable panel on screen.
// Transitions reveal the destination when it is ready, without a loading visual.
export default function Admin(props: Props) {
  return <Suspense fallback={<AdminSectionPending tab={props.initialTab ?? "content"} />}><AdminContent {...props} /></Suspense>;
}
