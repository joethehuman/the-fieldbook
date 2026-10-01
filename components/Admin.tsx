"use client";
import { DetailNavigation } from "./patterns/detail-navigation";
import { Badge } from "./ui/badge";
import { Pagination } from "./patterns/pagination";
import { contentRelationshipCommands } from "./bulk-relationships";
import type { BulkHandler } from "@/lib/bulk-actions";
import { AdminBulkActions } from "./AdminBulkActions";
import { RecentlyDeleted } from "./RecentlyDeleted";
import { PeopleBulkActions } from "./PeopleBulkActions";
import { SelectRows, useBulkSelection } from "./patterns/bulk-selection";
import { CreatableCombobox } from "./ui/creatable-combobox";
import { DocSectionPicker } from "./DocSectionPicker";
import DocSectionCreate from "./DocSectionCreate";
import { WritingEditor } from "./patterns/writing-editor";
import { EditorFrame, EditorDetailsGroup, type DetailsReveal } from "./patterns/editor-frame";
import { revealEditorTarget } from "./patterns/reveal-editor-target";
import { hasMissingImageAlt } from "@/lib/markdown-compatibility";
import { createDraftSaveQueue, type SaveIntent } from "@/lib/draft-save-queue";
import { contentSignature, hasUnpublishedEdits } from "@/lib/demo-publication";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { PublicationStatus } from "./patterns/publication-status";
import { FieldDescription } from "./ui/field";
import { FormField } from "@/components/patterns/form-field";
import { FilterOptions } from "./patterns/filter-options";
import { useToast } from "./ui/toast";
import { DataTable } from "./patterns/data-table";
import { ResponsiveTabsNavigation } from "./patterns/responsive-tabs-navigation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { CollectionControls, CollectionEmpty } from "./patterns/collection-controls";
import { equalJson } from "@/lib/equal-json";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox, Radio } from "@/components/ui/choice";
import { useRevealTarget } from "./patterns/use-reveal-target";
import { Card } from "@/components/ui/card";
import {
  TableContainer,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import {
  SectionHeader,
  CollectionToolbar,
  Toolbar,
} from "@/components/patterns/layout";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { SelectField } from "./ui/select";
import LearningGroups from "./LearningGroups";
import Curricula from "./Curricula";
import { groupItems } from "@/lib/learning-groups";
import { groupPath } from "@/lib/group-hierarchy";
import { teamPath } from "@/lib/team-hierarchy";
import { Assignments, type LearningHandler } from "./Assignments";
import {
  availableDocSections,
  createDocSection,
  sectionForDoc,
  type DocSection,
} from "@/lib/docs-navigation";
import { defaultSettings } from "@/lib/settings";
import { OnboardingFields } from "./OnboardingFields";
import { PendingPeople } from "./PendingPeople";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  NavigationGuard,
  RegisterNavigationGuard,
} from "@/lib/navigation-guard";
import { ActionGroup } from "./ui/action-group";
import { GroupPicker } from "./patterns/group-picker";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

import {
  Plus,
  X,
  Save,
  FileText,
  Users,
  Layers,
  BarChart3,
  Trash2,
  ArrowLeft,
  Check,
  Settings,
  MessageSquare,
} from "lucide-react";
import { CardArtEditor } from "./patterns/card-art-editor";
import { graphemeCount, resolvedCardArt } from "@/lib/card-art";
import { type UploadMedia } from "./MarkdownEditor";
import { CourseBuilder } from "./CourseBuilder";
import { requiresPassing, validQuestion } from "@/lib/course-quiz";
import SiteSettingsPanel from "./SiteSettingsPanel";
import { SettingsSection } from "./patterns/settings-section";
import { FeedbackAdmin } from "./Feedback";
import { TeamsAdmin, TeamProgress } from "./Teams";
import { videoSource } from "@/lib/video";
import type { Workspace } from "@/lib/store";
import { effectiveGroups, type Content, type User } from "@/lib/types";
const adminSections = [
  {
    label: "Publishing",
    items: [
      {
        id: "content",
        name: "Content",
        description: "Create and maintain courses, docs, and updates.",
        icon: FileText,
      },
      {
        id: "feedback",
        name: "Feedback",
        description: "See what readers and learners are telling you.",
        icon: MessageSquare,
      },
    ],
  },
  {
    label: "People & courses",
    items: [
      {
        id: "people",
        name: "People",
        description: "Manage accounts, access, and group membership.",
        icon: Users,
      },
      {
        id: "teams",
        name: "Teams",
        description: "Organize reporting teams and their managers.",
        icon: Users,
      },
      {
        id: "groups",
        name: "Learning groups",
        description: "Manage people, assigned courses, and relevant updates.",
        icon: Layers,
      },
      {
        id: "curricula",
        name: "Curricula",
        description: "Build reusable playlists of courses.",
        icon: Layers,
      },
      {
        id: "progress",
        name: "Progress",
        description: "Understand completion across your organization.",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "Organization Settings",
    items: [
      {
        id: "settings-identity",
        name: "Identity",
        description: "Installation name, welcome description and privacy link.",
        icon: Settings,
      },
      {
        id: "settings-docs",
        name: "Docs navigation",
        description: "Choose the section order for Docs.",
        icon: FileText,
      },
      {
        id: "settings-courses",
        name: "Due dates",
        description: "Choose whether group-selected courses have due dates.",
        icon: Layers,
      },
      {
        id: "settings-access",
        name: "Access",
        description: "Manage browsing access and account registration.",
        icon: Users,
      },
      {
        id: "settings-privacy",
        name: "Privacy",
        description: "Maintain and publish your organization’s privacy policy.",
        icon: FileText,
      },
      {
        id: "settings-mcp",
        name: "MCP",
        description: "Connect your AI tools to Fieldbook.",
        icon: Settings,
      },
      {
        id: "deleted",
        name: "Recently deleted",
        description: "Recover deleted content and users for 30 days.",
        icon: Trash2,
      },
    ],
  },
];
type Props = {
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
  onReload?: () => Promise<Workspace>;
};
const id = () => crypto.randomUUID();
export default function Admin({
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
  const [tab, setTab] = useState("content"),
    [openingTab, setOpeningTab] = useState<string | null>(null),
    [openingItem, setOpeningItem] = useState<string | null>(null),
    [editing, setEditing] = useState<Content | null>(null),
    [person, setPerson] = useState<User | null>(null),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [contentSort, setContentSort] = useState("created"),
    [peopleSort, setPeopleSort] = useState("title"),
    [peopleRole, setPeopleRole] = useState("all"),
    [peopleGroup, setPeopleGroup] = useState("all"),
    [peopleTeam, setPeopleTeam] = useState("all"),
    [peopleStatus, setPeopleStatus] = useState("all"),
    [detailScope, setDetailScope] = useState<{
      groupId?: string;
      userId?: string;
    } | null>(null);
  const [contentStatus, setContentStatus] = useState("all"),
    [contentSection, setContentSection] = useState("all"),
    [page, setPage] = useState(1);
  const [personBusy, setPersonBusy] = useState(false);
  const [personError, setPersonError] = useState("");
  const personBaseline = useRef<User | null>(null);
  const personSaving = useRef(false);
  const personDirty = !!person && !equalJson(person, personBaseline.current);
  const personGuard = useRef(async () => true);
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
    setEditing({
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
    });
  }
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
        registerNavigationGuard={registerNavigationGuard}
        onReload={onReload}
      />
    );
  const detailPerson = data.users.find((u) => u.id === detailScope?.userId);
  const detailView = detailScope && (
    <div className="grid gap-4">
      <DetailNavigation items={[{ label: detailScope.userId ? "Back to people" : "Back to learning groups", onSelect: () => { setDetailScope(null); adminPanel.reveal(); } }]} current={detailPerson?.name} />
      {detailScope.groupId ? <LearningGroups data={data} onChange={onChange} onLearning={manageLearning} onLearningMany={manageLearningMany} initialGroup={detailScope.groupId} /> : <>
        <SectionHeader variant="page" title={<h2>{detailPerson?.name}</h2>} description={detailPerson?.email} />
        <Assignments key={detailScope.userId} data={data} scope={detailScope} onAction={manageLearning} onChange={onChange} onOpenGroup={(groupId) => setDetailScope({ groupId })} />
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
        await onOpenTab(next);
      } catch (error) {
        setNotice((error as Error).message);
        setOpeningTab(null);
        return;
      }
      setOpeningTab(null);
    }
    setTab(next);
    setDetailScope(null);
    adminPanel.reveal(false);
    setNotice("");
    setQuery("");
  }
  return (
    <div className="admin-workspace" aria-busy={!!openingTab}>
      <h1 className="sr-only">Administration</h1>
      {openingTab && (
        <span className="sr-only" role="status">
          Loading administration data
        </span>
      )}
      <Tabs
        className="admin-layout"
        orientation="vertical"
        value={tab}
        onValueChange={changeAdminTab}
      >
        <ResponsiveTabsNavigation
          label="Administration section"
          value={tab}
          onValueChange={changeAdminTab}
          options={adminSections
            .flatMap((section) => section.items)
            .map((item) => ({
              id: item.id,
              name:
                item.id === "people" && !production
                  ? "Demo profiles"
                  : item.name,
            }))}
        >
          {adminSections.map((section) => (
            <div className="admin-nav-group" key={section.label}>
              <span className="admin-nav-label">{section.label}</span>
              {section.items.map((item) => (
                <TabsTrigger
                  value={item.id}
                  key={item.id}
                  className={tab === item.id ? "selected" : ""}
                >
                  <item.icon size={16} />
                  {item.id === "people" && !production
                    ? "Demo profiles"
                    : item.name}
                </TabsTrigger>
              ))}
            </div>
          ))}
        </ResponsiveTabsNavigation>
        <TabsContent
          {...adminPanel.targetProps}
          tabIndex={0}
          value={tab}
          className="admin-panel mt-0"
          key={tab}
        >
          <>
          {!detailScope && !["groups", "curricula", "progress", "feedback", "teams"].includes(
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
              <CollectionToolbar
                filters={
                  <FilterOptions
                    label="Content type"
                    variant="underline"
                    value={filter}
                    onValueChange={(value) => {
                      setFilter(value);
                      setContentSection("all");
                      setCategory("all");
                    }}
                    options={[
                      { value: "all", label: "All content" },
                      { value: "doc", label: "Docs" },
                      { value: "brief", label: "Updates" },
                      { value: "course", label: "Courses" },
                    ]}
                  />
                }
              >
                <ActionGroup>
                  <Button onClick={() => create("doc")}>
                    <Plus size={15} />
                    Doc
                  </Button>
                  <Button onClick={() => create("brief")}>
                    <Plus size={15} />
                    Update
                  </Button>
                  <Button variant="default" onClick={() => create("course")}>
                    <Plus size={15} />
                    Course
                  </Button>
                </ActionGroup>
              </CollectionToolbar>
              <CollectionControls
                filters={contentFilters}
                onClear={clearContentFilters}
                sortLabel={contentSort === "created" ? "Newest created" : contentSort === "title" ? "Title A–Z" : contentSort === "updated" ? "Recently updated" : "Oldest update first"}
                sort={
                <FormField label="Sort content">
                  <SelectField
                    value={contentSort}
                    onValueChange={setContentSort}
                  >
                    <option value="created">Newest created</option>
                    <option value="title">Title A–Z</option>
                    <option value="updated">Recently updated</option>
                    <option value="oldest">Oldest update first</option>
                  </SelectField>
                </FormField>
                }
                search={
                  <FormField label="Search content" visuallyHiddenLabel>
                    <Input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search content by title, summary, or folder"
                    />
                  </FormField>
                }
              >
                {filter !== "doc" && (
                  <FormField label="Category">
                    <SelectField
                      value={category}
                      onValueChange={(value) => setCategory(value)}
                    >
                      <option value="all">All categories</option>
                      {[
                        ...new Set(
                          data.content
                            .filter(
                              (c) => filter === "all" || c.kind === filter,
                            )
                            .map((c) => c.category),
                        ),
                      ]
                        .sort()
                        .map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                    </SelectField>
                  </FormField>
                )}
                <FormField label="Publication status">
                  <SelectField
                    value={contentStatus}
                    onValueChange={setContentStatus}
                  >
                    <option value="all">All statuses</option>
                    <option value="published">Published</option>
                    <option value="draft">Draft only</option>
                  </SelectField>
                </FormField>
                {filter === "doc" && (
                  <FormField label="Docs section">
                    <SelectField
                      value={contentSection}
                      onValueChange={setContentSection}
                    >
                      <option value="all">All sections</option>
                      {availableDocSections(
                        data.content.filter((c) => c.kind === "doc"),
                        data.settings?.docCategoryOrder,
                        data.settings?.docSections,
                      ).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.parentId
                            ? `${data.settings?.docSections?.find((p) => p.id === s.parentId)?.name || s.legacyCategory} / `
                            : ""}
                          {s.name}
                        </option>
                      ))}
                    </SelectField>
                  </FormField>
                )}

              </CollectionControls>
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
                      <TableHead>Content</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Version</TableHead>
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
                                  setEditing(structuredClone(c));
                                  return;
                                }
                                setOpeningItem(c.id);
                                try {
                                  setEditing(await onEdit(c.id));
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
                              onClick={() => { setDetailScope({ userId: u.id }); adminPanel.reveal(); }}
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
export function Editor({
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
