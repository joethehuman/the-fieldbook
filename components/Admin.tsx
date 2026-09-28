"use client";
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
import { hasMissingImageAlt } from "@/lib/markdown-compatibility";
import { hasUnpublishedEdits } from "@/lib/demo-publication";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "./ui/collapsible";
import { MoreHorizontal, ChevronDown } from "lucide-react";
import { PublicationStatus } from "./patterns/publication-status";
import { FieldDescription } from "./ui/field";
import { FormField } from "@/components/patterns/form-field";
import { useToast } from "./ui/toast";
import { DataTable } from "./patterns/data-table";
import { ResponsiveTabsNavigation } from "./patterns/responsive-tabs-navigation";
import { FilterOptions } from "./patterns/filter-options";
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
  PageHeader,
  SectionHeader,
  CollectionToolbar,
  Toolbar,
  FilterBar,
} from "@/components/patterns/layout";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { SelectField } from "./ui/select";
import LearningGroups from "./LearningGroups";
import Curricula from "./Curricula";
import { groupItems } from "@/lib/learning-groups";
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
import { Tabs, TabsTrigger, TabsContent } from "./ui/tabs";

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
        id: "groups",
        name: "Learning groups",
        description: "Manage people, assigned courses, and relevant updates.",
        icon: Layers,
      },
      {
        id: "teams",
        name: "Teams",
        description: "Organize reporting teams and their managers.",
        icon: Users,
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
        id: "deleted",
        name: "Recently deleted",
        description: "Recover deleted content and users for 30 days.",
        icon: Trash2,
      },
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
    ],
  },
];
type Props = {
  onBulk: BulkHandler;
  data: Workspace;
  user: User;
  onOpenTab?: (tab: string) => Promise<void>;
  onEdit?: (id: string) => Promise<Content>;
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
  const registerAdminGuard = useCallback<RegisterNavigationGuard>(
    (guard) => {
      adminGuard.current = guard;
      registerNavigationGuard?.(guard);
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
    [sort, setSort] = useState("title"),
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
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "updated"
          ? b.updatedAt.localeCompare(a.updatedAt)
          : a.updatedAt.localeCompare(b.updatedAt),
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
      sort === "reverse"
        ? b.name.localeCompare(a.name)
        : a.name.localeCompare(b.name),
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
  ]);
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
      category: kind === "course" ? "New category" : "",
      folder: "",
      status: "draft",
      version: 1,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      assignments: [],
      duration: 5,
      groups: [],
      lessons:
        kind === "course" ? [{ id: id(), title: "Lesson 1", body: "" }] : [],
      questions: [],
      ...(kind === "course" ? { requirePassing: false } : {}),
    });
  }
  async function save(c: Content) {
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
    if (c.kind === "course") setEditing(null);
    const label =
      c.kind === "brief" ? "Update" : c.kind === "doc" ? "Doc" : "Course";
    setNotice("");
    notify(
      `${label} ${c.status === "published" ? "published" : "draft saved"}${production ? "." : " in this browser."}`,
    );
    // The server may normalize the draft while saving. Keep the editor's
    // baseline on the persisted revision so a second publish is not treated
    // as a concurrent edit.
    return production && onEdit ? await onEdit(c.id) : updated;
  }
  async function savePerson(e: React.FormEvent) {
    e.preventDefault();
    if (!person) return;
    if (
      data.users.some(
        (u) =>
          u.id !== person.id &&
          u.email.toLowerCase() === person.email.toLowerCase(),
      )
    ) {
      setNotice("A profile already uses that email.");
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
      setNotice((e as Error).message);
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
  if (detailScope?.groupId)
    return (
      <>
        <Button
          variant="link"
          onClick={() => {
            setDetailScope(null);
            setTab("groups");
          }}
        >
          ← Administration
        </Button>
        <LearningGroups
          data={data}
          onChange={onChange}
          onLearning={manageLearning}
          onLearningMany={manageLearningMany}
          initialGroup={detailScope.groupId}
        />
      </>
    );
  if (detailScope?.userId) {
    const person = data.users.find((u) => u.id === detailScope.userId);
    return (
      <>
        <Button
          variant="link"
          onClick={() => {
            setTab("people");
            setDetailScope(null);
          }}
        >
          <ArrowLeft size={16} /> Back to people
        </Button>
        <PageHeader>
          <h1>{person?.name}</h1>
          <p>{person?.email}</p>
        </PageHeader>
        <Assignments
          key={detailScope.userId}
          data={data}
          scope={detailScope}
          onAction={manageLearning}
          onChange={onChange}
          onOpenGroup={(groupId) => setDetailScope({ groupId })}
        />
      </>
    );
  }

  async function changeAdminTab(next: string) {
    if (next === tab || (adminGuard.current && !(await adminGuard.current())))
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
          {!["groups", "curricula", "progress", "feedback", "teams"].includes(
            tab,
          ) && (
            <SectionHeader
              title={
                <h2>
                  {
                    adminSections
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
            ></SectionHeader>
          )}
          {notice && <Alert variant="destructive">{notice}</Alert>}
          {tab === "deleted" ? (
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
                  <Button variant="outline" onClick={() => create("doc")}>
                    <Plus size={15} />
                    Doc
                  </Button>
                  <Button variant="outline" onClick={() => create("brief")}>
                    <Plus size={15} />
                    Update
                  </Button>
                  <Button variant="default" onClick={() => create("course")}>
                    <Plus size={15} />
                    Course
                  </Button>
                </ActionGroup>
              </CollectionToolbar>
              <FilterBar>
                <FormField label="Search content">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Title, summary, or folder"
                  />
                </FormField>
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
                <FormField label="Sort content">
                  <SelectField
                    value={sort}
                    onValueChange={(value) => setSort(value)}
                  >
                    <option value="title">Title A–Z</option>
                    <option value="updated">Recently updated</option>
                    <option value="oldest">Oldest update first</option>
                  </SelectField>
                </FormField>
              </FilterBar>
              <AdminBulkActions
                data={data}
                collectionSize={selection.collectionSize}
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
              <TableContainer>
                <DataTable layout="contentSelection">
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {selection.canSelect && (
                          <SelectRows
                            label="Select this page"
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
                              aria-label={`Select ${c.title}`}
                              checked={selection.selected.includes(c.id)}
                              onCheckedChange={(v) =>
                                selection.toggle(c.id, v === true)
                              }
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <strong>{c.title}</strong>
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
                          <ActionGroup>
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
              </TableContainer>
              <Pagination
                label="Content"
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
              <SettingsSection
                id="new-users"
                title={<h2>New users</h2>}
                guidance="Applies to newly added users and new self-registrations. You can override the stage and start date for each person. Group membership still determines assigned courses."
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
              {production && <PendingPeople data={data} onChange={onChange} />}
              <Toolbar>
                <p className="muted">
                  {production
                    ? "Manage signed-in accounts. Deactivation preserves course history. Clear managed teams before removing a manager’s access."
                    : "Sample profiles for trying role-based assignments. No accounts or emails are created."}
                </p>
                {!production && (
                  <Button
                    variant="default"
                    onClick={() =>
                      setPerson({
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
              </Toolbar>
              <FilterBar>
                <FormField label="Search profiles">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Name or email"
                  />
                </FormField>
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
                        {g.name}
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
                <FormField label="Sort profiles">
                  <SelectField
                    value={sort}
                    onValueChange={(value) => setSort(value)}
                  >
                    <option value="title">Name A–Z</option>
                    <option value="reverse">Name Z–A</option>
                  </SelectField>
                </FormField>
              </FilterBar>
              <FormField label="Reporting team">
                <SelectField value={peopleTeam} onValueChange={setPeopleTeam}>
                  <option value="all">All teams</option>
                  <option value="none">No team</option>
                  {(data.teams || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </SelectField>
              </FormField>
              <PeopleBulkActions
                currentUserId={user.id}
                data={data}
                collectionSize={selection.collectionSize}
                selected={selection.actionIds}
                onChange={onChange}
                onSelectionChange={selection.setSelected}
                onBulk={onBulk}
              />
              <TableContainer>
                <DataTable layout="peopleSelection">
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {selection.canSelect && (
                          <SelectRows
                            label="Select this page"
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
                        <TableCell>{u.role}</TableCell>
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
                          <ActionGroup>
                            <Button
                              variant="link"
                              onClick={() => setPerson(structuredClone(u))}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="link"
                              onClick={() => setDetailScope({ userId: u.id })}
                            >
                              Courses & progress
                            </Button>
                          </ActionGroup>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              </TableContainer>
              <Pagination
                label="People"
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
        </TabsContent>
      </Tabs>
      <Dialog
        open={!!person}
        onOpenChange={(open) => {
          if (!open) setPerson(null);
        }}
      >
        {person && (
          <DialogContent className="profile-dialog">
            <form className="profile-form" onSubmit={savePerson}>
              <Button
                variant="ghost"
                type="button"
                size="icon"
                className="absolute top-3 right-3"
                aria-label="Close profile editor"
                onClick={() => setPerson(null)}
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
                  <option value="admin">Admin</option>
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
                      {t.name}
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
                <Button variant="default">
                  <Save size={16} />
                  Save profile
                </Button>
              </DialogFooter>
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
  production = false,
  registerNavigationGuard,
  onReload,
}: {
  onUpload?: UploadMedia;
  registerNavigationGuard?: RegisterNavigationGuard;
  onReload?: () => Promise<Workspace>;
  production?: boolean;
  content: Content;
  data: Workspace;
  onSave: (c: Content) => Content | void | Promise<Content | void>;
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
  const form = useRef<HTMLFormElement>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const historyGuardArmed = useRef(false);
  const [recovering, setRecovering] = useState(false);
  const busy = saving || uploadCount > 0 || recovering;
  const dirty =
    JSON.stringify(c) !== JSON.stringify(baseline.current) || refresh;
  const guard = useRef(async () => true);
  guard.current = async () => {
    if (pendingUploads.current || savingNow.current || recovering) {
      return false;
    }
    return (
      !dirty ||
      (await confirm(
        "Discard unsaved content changes? Cancel to keep editing or save first. Changes already saved to sections or learning groups are kept.",
      ))
    );
  };
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
  useEffect(() => {
    if (!production) return;
    if (!dirty && !busy) {
      historyGuardArmed.current = false;
      return;
    }
    if (!historyGuardArmed.current) {
      historyGuardArmed.current = true;
      window.history.pushState(window.history.state, "", window.location.href);
    }
    const onBack = () => {
      if (!historyGuardArmed.current) return;
      // Back first reaches the identical Admin URL, keeping the editor mounted
      // while the async discard dialog runs. Restore the guard entry at once.
      window.history.pushState(window.history.state, "", window.location.href);
      void guard.current().then((approved) => {
        if (approved) {
          historyGuardArmed.current = false;
          window.history.go(-2);
        }
      });
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [production, dirty, busy]);
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
    if (!onReload || busy) return;
    setRecovering(true);
    try {
      const latest = (await onReload()).content.find(
        (item) => item.id === c.id,
      );
      if (!latest) {
        setError(
          "No saved copy was found. Your edits remain here; you can retry saving.",
        );
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
  async function submit(e: React.FormEvent, intent?: "draft" | "published") {
    e.preventDefault();
    const saveStatus = intent || (c.kind === "course" ? c.status : "draft");
    if (busy || pendingUploads.current || savingNow.current) return;
    if (c.kind !== "doc") {
      const art = resolvedCardArt(c.id, c.title, c.cardArt, c.coverImageUrl);
      if (
        art.source === "generated" &&
        (!art.shortTitle.trim() || graphemeCount(art.shortTitle.trim()) > 40)
      ) {
        setError("Give generated artwork a short title of up to 40 characters.");
        setSettingsOpen(true);
        return;
      }
    }
    if (c.kind === "doc" && !sectionForDoc(c, docSections)) {
      setError("Choose a Docs section before saving.");
      setSettingsOpen(true);
      return;
    }
    if (
      c.kind === "course" &&
      saveStatus === "published" &&
      (!c.lessons.length ||
        c.lessons.some(
          (l) => !l.title.trim() || (!l.body.trim() && !l.videoUrl),
        ) ||
        c.questions.some((q) => !validQuestion(q)))
    ) {
      setError(
        "Published courses need at least one complete lesson and valid quiz questions with correct answers.",
      );
      return;
    }
    if (c.lessons.some((l) => l.videoUrl && !videoSource(l.videoUrl))) {
      setError("Use a supported HTTPS YouTube, Vimeo, Loom, MP4, or WebM URL.");
      return;
    }
    if (
      c.kind === "course" &&
      saveStatus === "published" &&
      c.lessons.some((l) => hasMissingImageAlt(l.body))
    ) {
      setError("Add alternative text to every lesson image before publishing.");
      return;
    }
    const liveCourse = data.publishedContent?.find((item) => item.id === c.id);
    if (
      c.kind === "course" &&
      saveStatus === "published" &&
      !refresh &&
      liveCourse &&
      requiresPassing(c) !== requiresPassing(liveCourse)
    ) {
      setError(
        "Changing the quiz completion rule requires publishing a new version. Choose Publish a new version in the course settings.",
      );
      return;
    }
    savingNow.current = true;
    setSaving(true);
    setError("");
    try {
      const latest = data.content.find((x) => x.id === c.id);
      const editable = (item: Content) => {
        const {
          revision,
          publishedRevision,
          groups,
          assignments,
          updatedAt,
          ...body
        } = item;
        return JSON.stringify({
          ...body,
          ...(item.kind === "course" ? {} : { groups }),
        });
      };
      if (latest && editable(latest) !== editable(original.current))
        throw new Error(
          "This content changed while you were editing. Download your draft, then review the saved copy before reapplying changes.",
        );
      const saved: Content = {
        ...c,
        ...(c.kind !== "doc" && !existing && !c.cardArt
          ? { cardArt: resolvedCardArt(c.id, c.title, undefined, c.coverImageUrl) }
          : {}),
        status: saveStatus,
        ...(latest
          ? {
              assignments: latest.assignments,
              groups: c.kind === "course" ? latest.groups : c.groups,
              revision: latest.revision,
            }
          : {}),
        title: c.title.trim(),
        category: c.category.trim(),
        version:
          existing && refresh
            ? original.current.version + 1
            : original.current.version,
      };
      const persisted = (await onSave(saved)) || saved;
      original.current = persisted;
      baseline.current = persisted;
      setC(persisted);
      setRefresh(false);
      setSavedMessage(saveStatus === "published" ? "Published" : "Draft saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      savingNow.current = false;
      setSaving(false);
    }
  }
  const set = (key: string, value: unknown) =>
    setC((prev) => ({ ...prev, [key]: value }));
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
      onSubmit={submit}
      onInvalidCapture={(event) => {
        const control = event.target as HTMLInputElement;
        if (c.kind !== "course" && !control.getClientRects().length) {
          event.preventDefault();
          setSettingsOpen(true);
          requestAnimationFrame(() => {
            control.focus();
            control.reportValidity();
          });
        }
      }}
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          if (c.kind !== "course" && form.current?.reportValidity())
            void submit(event, "draft");
        }
      }}
    >
      <Button
        variant="link"
        type="button"
        disabled={busy}
        onClick={async () => {
          if (await guard.current()) onCancel();
        }}
      >
        <ArrowLeft size={16} />
        Back to content
      </Button>
      <div className="editor-heading">
        <div>
          <span className="eyebrow">
            {existing ? "EDIT" : "CREATE"}{" "}
            {c.kind === "doc"
              ? "DOC"
              : c.kind === "brief"
                ? "UPDATE"
                : "COURSE"}
          </span>
          <h1>{existing ? c.title : "Something worth sharing."}</h1>
        </div>
        <ActionGroup>
          {c.kind !== "course" && (
            <span role="status" className="text-copy text-muted-foreground">
              {dirty
                ? "Unsaved changes"
                : savedMessage ||
                  (existing ? "All changes saved" : "Not saved yet")}
            </span>
          )}
          <Button
            type="submit"
            variant={c.kind === "course" ? "default" : "outline"}
            loading={saving}
            disabled={busy}
          >
            <Save size={16} />
            {c.kind === "course"
              ? `Save ${c.status === "published" ? "& publish" : "draft"}`
              : "Save draft"}
          </Button>
          {c.kind !== "course" && (
            <Button
              type="button"
              disabled={busy}
              onClick={(event) => {
                if (form.current?.reportValidity())
                  void submit(event, "published");
              }}
            >
              {data.content.find((item) => item.id === c.id)?.publishedRevision
                ? "Publish changes"
                : "Publish"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="More writing actions"
                disabled={busy}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={downloadDraft}>
                Download draft
              </DropdownMenuItem>
              {onReload && (
                <DropdownMenuItem onSelect={() => void reloadSaved()}>
                  Review saved copy
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </ActionGroup>
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
            ? "Uploading media. Keep this page open; save when the upload finishes."
            : "Saving or refreshing. Keep this page open."}
        </p>
      )}
      <FieldGroup
        disabled={busy}
        className={`editor-layout${c.kind === "course" ? " course-editor-layout" : ""}`}
      >
        {c.kind === "course" && (
          <section
            className="course-editor-metadata"
            aria-label="Course introduction"
          >
            <FormField label="Title">
              <Input
                required
                maxLength={160}
                value={c.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Give it a clear, useful title"
              />
            </FormField>
            <FormField label="Short description">
              <Textarea
                required
                rows={3}
                maxLength={300}
                value={c.summary}
                onChange={(e) => set("summary", e.target.value)}
                placeholder="What will people learn?"
              />
            </FormField>
          </section>
        )}
        <section className="editor-main">
          {c.kind !== "course" && (
            <>
              <FormField label="Title">
                <Input
                  required
                  maxLength={160}
                  value={c.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="Give it a clear, useful title"
                />
              </FormField>
              <FormField label="Short description">
                <Textarea
                  required
                  rows={2}
                  maxLength={300}
                  value={c.summary}
                  onChange={(e) => set("summary", e.target.value)}
                  placeholder="What will people find here?"
                />
              </FormField>
            </>
          )}
          {c.kind !== "course" ? (
            <WritingEditor
              label={c.kind === "doc" ? "Doc content" : "Update content"}
              value={c.body}
              onChange={(value) => set("body", value)}
              onUpload={upload}
              disabled={busy}
            />
          ) : (
            <CourseBuilder
              course={c}
              onChange={(updater) => setC(updater)}
              onUpload={upload}
              disabled={busy}
              onError={setError}
            />
          )}
        </section>
        <aside className="editor-settings">
          <Collapsible
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            className="grid gap-4"
          >
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={c.kind === "course" ? "hidden" : "lg:hidden"}
              >
                Content settings <ChevronDown />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent
              forceMount
              className={
                c.kind === "course"
                  ? "grid gap-6"
                  : "hidden data-[state=open]:grid lg:grid gap-6"
              }
            >
              {c.kind !== "course" ? (
                <SettingsSection
                  id="writing-publication"
                  title={<h3>Publication</h3>}
                  guidance="Save draft keeps your work private. Publish changes when they are ready for readers."
                >
                  <PublicationStatus
                    published={
                      !!data.content.find((item) => item.id === c.id)
                        ?.publishedRevision
                    }
                    hasUnpublishedChanges={hasUnpublishedEdits(
                      data.content.find((item) => item.id === c.id) || c,
                      production
                        ? undefined
                        : data.publishedContent?.find(
                            (live) => live.id === c.id,
                          ),
                    )}
                  />
                  <p className="text-copy text-muted-foreground">
                    {production
                      ? "Drafts are visible to administrators."
                      : "Saved in this browser. Other visitors do not see your edits."}
                  </p>
                </SettingsSection>
              ) : (
                <section className="editor-setting-section">
                  <h3>Publishing</h3>
                  {production && (
                    <p className="muted">
                      Saving a draft keeps the current public version online.
                      Select Published to replace it. Unpublish from the content
                      list to remove public access.
                    </p>
                  )}
                  <FormField label="Status">
                    <SelectField
                      value={c.status}
                      onValueChange={(value) => set("status", value)}
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </SelectField>
                  </FormField>
                </section>
              )}
              <SettingsSection
                id="writing-organization"
                title={<h3>Organization</h3>}
                guidance={
                  c.kind === "doc"
                    ? "Choose where this doc appears in Docs navigation."
                    : "Use a clear category to help readers find related content."
                }
              >
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
                      variant="outline"
                      disabled={busy}
                      onClick={() => setCreatingSection((open) => !open)}
                    >
                      Create section
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
                  <FormField label="Category">
                    <CreatableCombobox
                      required
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
              </SettingsSection>
              {c.kind === "brief" && (
                <SettingsSection
                  id="writing-relevance"
                  title={<h3>For you</h3>}
                  guidance="Choose groups this update is relevant to. Everyone allowed into the installation can still read it."
                >
                  <GroupPicker
                    groups={data.groups}
                    showDescription={false}
                    value={c.groups}
                    onChange={(groups) => set("groups", groups)}
                  />
                </SettingsSection>
              )}
              {c.kind !== "doc" && (
                <CardArtEditor
                  id={c.id}
                  title={c.title}
                  kind={c.kind}
                  category={c.category}
                  art={c.cardArt}
                  legacyCover={c.coverImageUrl}
                  settings={data.settings}
                  onUpload={upload}
                  disabled={busy}
                  onChange={(cardArt) =>
                    setC((current) => ({
                      ...current,
                      cardArt,
                      ...(current.kind === "course" &&
                      cardArt.source === "upload" &&
                      cardArt.imageUrl
                        ? { coverImageUrl: cardArt.imageUrl }
                        : {}),
                    }))
                  }
                />
              )}
              {c.kind === "course" && (
                <>
                  <section className="editor-setting-section">
                    <h3>Course details</h3>
                    <FormField label="Estimated minutes">
                      <Input
                        type="number"
                        min={1}
                        max={600}
                        required
                        value={c.duration}
                        onChange={(e) =>
                          set("duration", Number(e.target.value))
                        }
                      />
                    </FormField>
                  </section>
                  <section className="editor-setting-section">
                    <h3>Assigned courses</h3>
                    <p className="muted">
                      Manage this course through Learning groups. Course
                      completion windows are managed in organization settings.
                    </p>
                    {existing &&
                    (data.publishedContent ?? data.content).some(
                      (x) => x.id === c.id && x.status === "published",
                    ) &&
                    onLearning ? (
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => {
                          setEditorTab("assignments");
                        }}
                      >
                        Manage learning groups
                      </Button>
                    ) : (
                      <p>
                        Publish this course to add it to a group’s assigned
                        courses.
                      </p>
                    )}
                  </section>
                  {existing && (
                    <section className="editor-setting-section">
                      <h3>Course version</h3>
                      <Field orientation="horizontal">
                        <Checkbox
                          aria-describedby="course-version-help"
                          checked={refresh}
                          onCheckedChange={(checked) =>
                            setRefresh(checked === true)
                          }
                        />
                        Publish a new version and start a new completion window
                      </Field>
                      <FieldDescription id="course-version-help">
                        Current version: {content.version}. Keep this unchecked
                        for minor corrections.
                      </FieldDescription>
                    </section>
                  )}
                </>
              )}
              {c.kind === "course" && (
                <div className="demo-note">
                  <strong>
                    {production
                      ? "Saved to your organization"
                      : "Saved in your browser"}
                  </strong>
                  <p>
                    {production
                      ? "Drafts are visible to administrators. Publish when you are ready to share with readers."
                      : "Published content is visible to demo profiles on this device. It is not shared with other visitors."}
                  </p>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </aside>
      </FieldGroup>
    </form>
  );
}
