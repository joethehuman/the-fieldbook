"use client";
import { useOrganizationChangeReview } from "./OrganizationChangeReview";
import { DetailNavigation } from "./patterns/detail-navigation";
import { EditorSaveStatus } from "./patterns/editor-save-status";
import { Badge } from "./ui/badge";
import { Spinner } from "./ui/spinner";
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
import {
  EditorFrame,
  EditorDetailsGroup,
  type DetailsReveal,
} from "./patterns/editor-frame";
import { revealEditorTarget } from "./patterns/reveal-editor-target";
import { useEditorLayout } from "./patterns/use-editor-layout";
import { hasMissingImageAlt } from "@/lib/markdown-compatibility";
import { createDraftSaveQueue, type SaveIntent } from "@/lib/draft-save-queue";
import { contentSignature, hasUnpublishedEdits } from "@/lib/demo-publication";
import { resumeDraft, revertToPublished } from "@/lib/draft-recovery";
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
import {
  CollectionControls,
  CollectionEmpty,
} from "./patterns/collection-controls";
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
import { useLearningAssignmentPicker } from "./use-learning-assignment-picker";
import { LearningAssignmentPicker } from "./LearningAssignmentPicker";
import { updateAudienceKeys } from "@/lib/content-audiences";
import { assignLearningToAudiences } from "@/lib/assignment-audiences";
import {
  OrganizationChangeCanceledError,
  type OrganizationChangeOptions,
} from "@/lib/organization-change";
import { useNestedNavigationGuard } from "./patterns/use-nested-navigation-guard";
import Curricula from "./Curricula";
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
import { learningStage, onboardingClockTarget } from "@/lib/learning";
import { PendingPeople } from "./PendingPeople";
import { PersonFields } from "./PersonFields";
import { ScrollRegion } from "./patterns/scroll-region";
import { RosterImport } from "./RosterImport";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  NavigationGuard,
  RegisterNavigationGuard,
  RegisterLandingNavigation,
} from "@/lib/navigation-guard";
import { ActionGroup } from "./ui/action-group";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogBody,
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
import { canAdminister, canOpenAdminTab, roleLabel } from "@/lib/permissions";
import SiteSettingsPanel from "./SiteSettingsPanel";
import { FeedbackAdmin } from "./Feedback";
import { TeamsAdmin, TeamProgress } from "./Teams";
import { videoSource } from "@/lib/video";
import type { Workspace } from "@/lib/store";
import {
  effectiveGroups,
  reportingTeamId,
  type Content,
  type User,
} from "@/lib/types";
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
        id: "settings-links",
        name: "External links",
        description: "Add up to three links to everyone’s account menu.",
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
        id: "settings-ai",
        name: "Ask AI",
        description: "Choose primary and fallback models, published sources and answer guidance.",
        icon: Settings,
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
  onImported?: () => Promise<void>;
  onOpenTab?: (tab: string) => Promise<void>;
  onPrepareAssignments?: () => Promise<Workspace>;
  onOpenPersonProgress?: (id: string) => Promise<void>;
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
  registerLandingNavigation?: RegisterLandingNavigation;
  onReload?: () => Promise<Workspace>;
  onSaveSettings?: (before: Workspace, settings: import("@/lib/settings").SiteSettings) => Promise<Workspace>;
  onReviewDeadlines?: (
    token?: string,
  ) => Promise<import("@/lib/assignment-episodes").DeadlineReview>;
  onLoadPublished?: (id: string) => Promise<Content>;
};
const id = () => crypto.randomUUID();
export default function Admin({
  onBulk,
  data,
  user,
  onImported,
  onOpenTab,
  onPrepareAssignments,
  onOpenPersonProgress,
  onEdit,
  onSaveContent,
  onUnpublish,
  onChange: persist,
  production = false,
  onUpload,
  onLearning,
  registerNavigationGuard,
  registerLandingNavigation,
  onReload,
  onSaveSettings,
  onReviewDeadlines,
  onLoadPublished,
}: Props) {
  const notify = useToast();
  const { confirm } = useInteractionDialog();
  const organizationReview = useOrganizationChangeReview();
  async function onChange(
    next: Workspace,
    options?: OrganizationChangeOptions,
  ) {
    if (!(await organizationReview.review(data, next, options)))
      throw new OrganizationChangeCanceledError();
    options?.validateCurrent?.();
    await persist(next, { locallyHandled: options?.locallyHandled });
  }
  const adminPanel = useRevealTarget();
  const adminGuard = useRef<NavigationGuard | null>(null);
  const profileNavigationGuard = useRef<NavigationGuard | null>(null);
  const adminProtected = useRef(false);
  const profileProtected = useRef(false);
  const registerAdminGuard = useCallback<RegisterNavigationGuard>(
    (guard, options) => {
      adminGuard.current = guard;
      adminProtected.current = !!options?.protected;
      registerNavigationGuard?.(
        guard || profileNavigationGuard.current
          ? async () => {
              if (
                profileNavigationGuard.current &&
                !(await profileNavigationGuard.current())
              )
                return false;
              return guard ? await guard() : true;
            }
          : null,
        { protected: adminProtected.current || profileProtected.current },
      );
    },
    [registerNavigationGuard],
  );
  const assignmentPicker = useLearningAssignmentPicker({
    data, onChange, onPrepare: onPrepareAssignments,
    registerNavigationGuard: registerAdminGuard,
  });
  const admin = canAdminister(user);
  const visibleSections = adminSections
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => canOpenAdminTab(user, item.id))
        .map((item) =>
          item.id === "deleted" && !admin
            ? { ...item, description: "Recover deleted content for 30 days." }
            : item,
        ),
    }))
    .filter((section) => section.items.length);
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
  personGuard.current = async () =>
    !personSaving.current &&
    (!personDirty || (await confirm("Discard unsaved profile changes?")));
  function openPerson(value: User) {
    personBaseline.current = structuredClone(value);
    setPerson(value);
    setPersonError("");
  }
  async function closePerson() {
    if (await personGuard.current()) setPerson(null);
  }
  useEffect(() => {
    if (!person) return;
    profileNavigationGuard.current = () => personGuard.current();
    profileProtected.current = personDirty || personBusy;
    registerAdminGuard(adminGuard.current, {
      protected: adminProtected.current,
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (personDirty || personSaving.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      profileNavigationGuard.current = null;
      profileProtected.current = false;
      registerAdminGuard(adminGuard.current, {
        protected: adminProtected.current,
      });
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
          ? (b.createdAt || b.updatedAt).localeCompare(
              a.createdAt || a.updatedAt,
            ) || a.id.localeCompare(b.id)
          : contentSort === "updated"
            ? b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)
            : a.updatedAt.localeCompare(b.updatedAt) ||
              a.id.localeCompare(b.id),
    );
  const peopleRows = data.users
    .filter(
      (u) =>
        `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()) &&
        (peopleTeam === "all" ||
          (peopleTeam === "none"
            ? !u.teamId
            : reportingTeamId(u.teamId, data.teams) === peopleTeam)) &&
        (peopleRole === "all" || u.role === peopleRole) &&
        (peopleGroup === "all" ||
          effectiveGroups(u, data.groups).has(peopleGroup)) &&
        (peopleStatus === "all" || u.active === (peopleStatus === "active")),
    )
    .sort(
      (a, b) =>
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
  const clearContentFilters = () => {
    setQuery("");
    setCategory("all");
    setContentStatus("all");
    setContentSection("all");
    setFilter("all");
  };
  const clearPeopleFilters = () => {
    setQuery("");
    setPeopleRole("all");
    setPeopleGroup("all");
    setPeopleStatus("all");
    setPeopleTeam("all");
  };
  const contentFilters = [
    ...(query
      ? [
          {
            id: "search",
            label: `Search: ${query}`,
            onRemove: () => setQuery(""),
          },
        ]
      : []),
    ...(category !== "all"
      ? [
          {
            id: "category",
            label: `Category: ${category}`,
            onRemove: () => setCategory("all"),
          },
        ]
      : []),
    ...(contentStatus !== "all"
      ? [
          {
            id: "status",
            label: contentStatus === "published" ? "Published" : "Draft only",
            onRemove: () => setContentStatus("all"),
          },
        ]
      : []),
    ...(contentSection !== "all"
      ? [
          {
            id: "section",
            label: `Section: ${data.settings?.docSections?.find((section) => section.id === contentSection)?.name || contentSection}`,
            onRemove: () => setContentSection("all"),
          },
        ]
      : []),
  ];
  const peopleFilters = [
    ...(query
      ? [
          {
            id: "search",
            label: `Search: ${query}`,
            onRemove: () => setQuery(""),
          },
        ]
      : []),
    ...(peopleRole !== "all"
      ? [
          {
            id: "role",
            label: roleLabel(peopleRole as User["role"]),
            onRemove: () => setPeopleRole("all"),
          },
        ]
      : []),
    ...(peopleStatus !== "all"
      ? [
          {
            id: "status",
            label: peopleStatus === "active" ? "Active" : "Inactive",
            onRemove: () => setPeopleStatus("all"),
          },
        ]
      : []),
    ...(peopleGroup !== "all"
      ? [
          {
            id: "group",
            label: `Group: ${groupPath(peopleGroup, data.groups)}`,
            onRemove: () => setPeopleGroup("all"),
          },
        ]
      : []),
    ...(peopleTeam !== "all"
      ? [
          {
            id: "team",
            label:
              peopleTeam === "none"
                ? "No direct team"
                : teamPath(peopleTeam, data.teams || []),
            onRemove: () => setPeopleTeam("all"),
          },
        ]
      : []),
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
    if (action.operation === "target" || action.operation === "untarget")
      return manageLearningMany([action]);
    if (onLearning) return onLearning(action);
    const next = structuredClone(data);
    const c = next.content.find((c) => c.id === action.contentId)!;
    if (action.operation === "assign" || action.operation === "unassign") {
      const updated = assignLearningToAudiences(
        next,
        [{ kind: "course", id: c.id }],
        [action.teamId ? `team:${action.teamId}` : `group:${action.groupId}`],
        action.operation === "assign" ? "add" : "remove",
      );
      next.groups = updated.groups;
      next.teams = updated.teams;
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
    const options = {
      review: {
        title: "Review Update audiences",
        confirmLabel: "Apply changes",
      },
    };
    if (!onLearning) {
      await onChange(next, options);
      return;
    }
    if (!(await organizationReview.review(data, next, options)))
      throw new OrganizationChangeCanceledError();
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
      lessons: kind === "course" ? [{ id: id(), title: "", body: "" }] : [],
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
      onboardingDays:
        person.hireDate || person.onboardingStart
          ? (person.onboardingDays ?? data.settings?.onboardingDays ?? 90)
          : undefined,
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
  useEffect(() => {
    registerLandingNavigation?.({
      isCurrent: tab === "content" && !editing && !detailScope && !person,
      // The shell has already accepted the editor/settings/profile guard.
      open: async () => {
        if (await changeAdminTab("content", true)) {
          setEditing(null);
          setPerson(null);
        }
      },
    });
    return () => registerLandingNavigation?.(null);
  });
  if (editing)
    return (
      <>
        <Editor
          key={editing.id}
          content={editing}
          data={data}
          onSave={save}
          onCancel={() => setEditing(null)}
          onUpload={onUpload}
          production={production}
          onLearning={admin ? manageLearning : undefined}
          onLearningMany={admin ? manageLearningMany : undefined}
          onWorkspaceChange={admin ? onChange : undefined}
          registerNavigationGuard={registerNavigationGuard}
          onReload={onReload}
          onLoadPublished={onLoadPublished}
          onPrepareAssignments={onPrepareAssignments}
        />
        {organizationReview.dialog}
      </>
    );
  const detailPerson = data.users.find((u) => u.id === detailScope?.userId);
  const detailView = detailScope && (
    <div className="grid gap-4">
      <DetailNavigation
        items={[
          {
            label: detailScope.userId
              ? "Back to people"
              : "Back to learning groups",
            onSelect: async () => {
              if (openingTab || openingItem) return;
              if (detailScope.userId && onOpenTab) {
                setOpeningTab("people");
                try {
                  await onOpenTab("people");
                } catch (error) {
                  setNotice((error as Error).message);
                  return;
                } finally {
                  setOpeningTab(null);
                }
              }
              setDetailScope(null);
              adminPanel.reveal();
            },
          },
        ]}
        current={detailPerson?.name}
      />
      {detailScope.groupId ? (
        <LearningGroups
          data={data}
          onChange={onChange}
          onLearning={manageLearning}
          onLearningMany={manageLearningMany}
          onPrepareAssignments={onPrepareAssignments}
          initialGroup={detailScope.groupId}
          registerNavigationGuard={registerAdminGuard}
        />
      ) : (
        <>
          <SectionHeader
            variant="page"
            title={<h2>{detailPerson?.name}</h2>}
            description={detailPerson?.email}
          />
          <Assignments
            key={detailScope.userId}
            data={data}
            scope={detailScope}
            onAction={manageLearning}
            onChange={onChange}
            onOpenGroup={async (groupId) => {
              if (await changeAdminTab("groups")) setDetailScope({ groupId });
            }}
          />
        </>
      )}
    </div>
  );

  async function changeAdminTab(next: string, approved = false) {
    if (!canOpenAdminTab(user, next)) return false;
    if (
      (next === tab && !detailScope && !editing && !person) ||
      (!approved && adminGuard.current && !(await adminGuard.current()))
    )
      return false;
    if (openingTab || openingItem) return false;
    if (onOpenTab) {
      setOpeningTab(next);
      try {
        await onOpenTab(next);
      } catch (error) {
        setNotice((error as Error).message);
        setOpeningTab(null);
        return false;
      }
      setOpeningTab(null);
    }
    setTab(next);
    setDetailScope(null);
    adminPanel.reveal(false);
    setNotice("");
    setQuery("");
    return true;
  }
  return (
    <div className="admin-workspace" aria-busy={!!openingTab || !!openingItem}>
      {organizationReview.dialog}
      <h1 className="sr-only">{admin ? "Administration" : "Publishing"}</h1>
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
          label={admin ? "Administration section" : "Publishing section"}
          value={tab}
          pendingValue={openingTab}
          onValueChange={async (next) => {
            await changeAdminTab(next);
          }}
          options={visibleSections
            .flatMap((section) => section.items)
            .map((item) => ({
              id: item.id,
              name:
                item.id === "people" && !production
                  ? "Demo profiles"
                  : item.name,
            }))}
        >
          {visibleSections.map((section) => (
            <div className="admin-nav-group" key={section.label}>
              <span className="admin-nav-label">{section.label}</span>
              {section.items.map((item) => (
                <TabsTrigger
                  value={item.id}
                  key={item.id}
                  className={tab === item.id ? "selected" : ""}
                >
                  {openingTab === item.id ? (
                    <Spinner />
                  ) : (
                    <item.icon size={16} />
                  )}
                  {item.id === "people" && !production
                    ? "Demo profiles"
                    : item.name}
                  {openingTab === item.id && (
                    <span className="sr-only">Opening…</span>
                  )}
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
            {!detailScope &&
              ![
                "groups",
                "curricula",
                "progress",
                "feedback",
                "teams",
              ].includes(tab) && (
                <SectionHeader
                  variant="page"
                  title={
                    <h2>
                      {tab === "people" && !production
                        ? "Demo profiles"
                        : visibleSections
                            .flatMap((s) => s.items)
                            .find((s) => s.id === tab)?.name}
                    </h2>
                  }
                  description={
                    <>
                      {
                        visibleSections
                          .flatMap((s) => s.items)
                          .find((s) => s.id === tab)?.description
                      }
                    </>
                  }
                >
                  {tab === "people" && (
                    <ActionGroup>
                      {production ? (
                        <PendingPeople
                          data={data}
                          onChange={onChange}
                          registerNavigationGuard={registerAdminGuard}
                        />
                      ) : (
                        <Button
                          variant="default"
                          onClick={() =>
                            openPerson({
                              id: id(),
                              name: "",
                              email: "",
                              role: "learner",
                              hireDate: undefined,
                              groups: [],
                              active: true,
                            })
                          }
                        >
                          <Plus size={16} />
                          Add demo profile
                        </Button>
                      )}
                      <RosterImport
                        data={data}
                        production={production}
                        onChange={persist}
                        registerNavigationGuard={registerAdminGuard}
                        onImported={async () => {
                          await onImported?.();
                          notify("People and teams imported.");
                        }}
                      />
                    </ActionGroup>
                  )}
                </SectionHeader>
              )}
            {notice && <Alert variant="destructive">{notice}</Alert>}
            {detailView ? (
              detailView
            ) : tab === "deleted" ? (
              <RecentlyDeleted
                data={data}
                onBulk={onBulk}
                contentOnly={!admin}
              />
            ) : tab.startsWith("settings-") ? (
              <SiteSettingsPanel
                key={tab}
                contributor={!admin}
                section={
                  tab.slice(9) as import("./SiteSettingsPanel").SettingsSection
                }
                registerNavigationGuard={registerAdminGuard}
                data={data}
                onReviewDeadlines={onReviewDeadlines}
                onChange={onChange}
                production={production}
                onSaveSettings={onSaveSettings}
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
                  sortLabel={
                    contentSort === "created"
                      ? "Newest created"
                      : contentSort === "title"
                        ? "Title A–Z"
                        : contentSort === "updated"
                          ? "Recently updated"
                          : "Oldest update first"
                  }
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
                    assignmentPicker.open,
                  )}
                />
                {!!contentRows.length && (
                  <TableContainer>
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

                                {admin &&
                                  c.kind === "course" &&
                                  (data.publishedContent ?? data.content).some(
                                    (live) =>
                                      live.id === c.id &&
                                      live.status === "published",
                                  ) && (
                                    <LearningAssignmentPicker
                                      data={data}
                                      item={{ kind: "course", id: c.id }}
                                      title={c.title}
                                      compact
                                      triggerLabel="Assign"
                                      onChange={onChange}
                                      onPrepare={onPrepareAssignments}
                                      registerNavigationGuard={
                                        registerAdminGuard
                                      }
                                    />
                                  )}
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
                                        if (onUnpublish)
                                          await onUnpublish(c.id);
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
                )}
                <CollectionEmpty
                  count={contentRows.length}
                  total={data.content.length}
                  noun="content items"
                  onClear={clearContentFilters}
                />
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
                <Toolbar>
                  <p className="muted">
                    {production
                      ? "Manage everyone, including people who have not signed in. Deactivation preserves course history. Clear managed teams before removing a manager’s access."
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
                      <option value="contributor">Contributor</option>
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
                    <SelectField
                      value={peopleTeam}
                      onValueChange={setPeopleTeam}
                    >
                      <option value="all">All teams</option>
                      <option value="none">No direct team</option>
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
                {!!peopleRows.length && (
                  <TableContainer>
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
                            <TableCell>{roleLabel(u.role)}</TableCell>
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
                              <div className="text-caption text-muted-foreground">
                                {learningStage(u, data.settings)}
                              </div>
                              {u.registered === false && (
                                <small>Not signed in</small>
                              )}
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
                                  loading={openingItem === u.id}
                                  disabled={!!openingTab || !!openingItem}
                                  onClick={async () => {
                                    setOpeningItem(u.id);
                                    try {
                                      await onOpenPersonProgress?.(u.id);
                                      setDetailScope({ userId: u.id });
                                      setNotice("");
                                      adminPanel.reveal();
                                    } catch (error) {
                                      setNotice((error as Error).message);
                                    } finally {
                                      setOpeningItem(null);
                                    }
                                  }}
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
                )}
                <CollectionEmpty
                  count={peopleRows.length}
                  total={data.users.length}
                  noun={production ? "people" : "demo profiles"}
                  onClear={clearPeopleFilters}
                />
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
                onPrepareAssignments={onPrepareAssignments}
                registerNavigationGuard={registerAdminGuard}
              />
            ) : tab === "groups" ? (
              <LearningGroups
                data={data}
                onChange={onChange}
                onLearning={manageLearning}
                onLearningMany={manageLearningMany}
                onPrepareAssignments={onPrepareAssignments}
                registerNavigationGuard={registerAdminGuard}
              />
            ) : (
              <TeamProgress data={data} user={user} />
            )}
          </>
        </TabsContent>
      </Tabs>
      {assignmentPicker.picker}
      <Dialog
        open={!!person}
        onOpenChange={(open) => {
          if (!open) void closePerson();
        }}
      >
        {person && (
          <DialogContent size="workflow">
            <form
              className="flex min-h-0 flex-1 flex-col gap-4"
              onSubmit={savePerson}
            >
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
              <DialogTitle>{production ? "Account" : "Demo profile"}</DialogTitle>
              <DialogDescription>
                {production
                  ? person.registered === false
                    ? "This preregistered person can activate their account with verified Google sign-in. Email is read-only."
                    : "Changes apply to this verified account. Login email is read-only."
                  : "Use fictional details. This does not create a secure account."}
              </DialogDescription>
              <DialogBody>
                <ScrollRegion className="h-full p-1">
                  <FieldGroup disabled={personBusy}>
                    {personError && (
                      <Alert variant="destructive">{personError}</Alert>
                    )}
                    {personDirty && (
                      <p role="status" className="text-caption text-muted-foreground">
                        Unsaved changes
                      </p>
                    )}
                    <PersonFields
                      person={person}
                      data={data}
                      onChange={setPerson}
                      emailLabel={production ? "Login email" : "Email label"}
                      emailReadOnly={production}
                      roleReadOnly={person.id === user.id}
                    />
                    {person.hireDate !== personBaseline.current?.hireDate && (
                      <FieldDescription>
                        Onboarding end:{" "}
                        {personBaseline.current
                          ? onboardingClockTarget(
                              personBaseline.current,
                              data.settings,
                            ) || "No clock"
                          : "No clock"}
                        {" → "}
                        {onboardingClockTarget(person, data.settings) || "No clock"}.
                        Save applies this clock change; course completion history is
                        preserved.
                      </FieldDescription>
                    )}
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
                  </FieldGroup>
                </ScrollRegion>
              </DialogBody>
              <DialogFooter className="justify-end">
                <Button type="button" variant="outline" onClick={closePerson}>
                  Cancel
                </Button>
                <Button variant="default" loading={personBusy}>
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
  onPrepareAssignments,
  onLearning,
  content,
  data,
  onSave,
  onCancel,
  onUpload,
  registerNavigationGuard,
  onReload,
  onLoadPublished,
}: {
  onPrepareAssignments?: () => Promise<Workspace>;
  onUpload?: UploadMedia;
  registerNavigationGuard?: RegisterNavigationGuard;
  onReload?: () => Promise<Workspace>;
  onLoadPublished?: (id: string) => Promise<Content>;
  production?: boolean;
  content: Content;
  data: Workspace;
  onSave: (
    c: Content,
    intent?: SaveIntent,
  ) => Content | void | Promise<Content | void>;
  onCancel: () => void;
  onLearning?: LearningHandler;
  onLearningMany?: (
    actions: import("@/lib/learning").LearningAction[],
  ) => Promise<void>;
  onWorkspaceChange?: (
    data: Workspace,
    options?: OrganizationChangeOptions,
  ) => void | Promise<void>;
}) {
  const notify = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [detailsReveal, setDetailsReveal] = useState<DetailsReveal>();
  const [revealStep, setRevealStep] = useState<{
    id: string;
    request: number;
    target?: "title" | "body";
    questionId?: string;
  }>();
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
  const recoveringNow = useRef(false);
  const attemptedSave = useRef<Content | undefined>(undefined);
  const busy = uploadCount > 0 || recovering;
  const current = useRef(c);
  current.current = c;
  const callbacks = useRef({ onSave, data, refresh });
  callbacks.current = { onSave, data, refresh };
  const queue = useRef<ReturnType<typeof createDraftSaveQueue> | null>(null);
  if (!queue.current)
    queue.current = createDraftSaveQueue({
      initial: c,
      idleMs: 900,
      read: () => current.current,
      save: async (snapshot, intent) => {
        const latest = callbacks.current.data.content.find(
          (item) => item.id === snapshot.id,
        );
        const saved: Content = {
          ...snapshot,
          status: intent,
          assignments: latest?.assignments || snapshot.assignments,
          groups:
            snapshot.kind === "course"
              ? latest?.groups || snapshot.groups
              : snapshot.groups,
          version:
            intent === "published" && callbacks.current.refresh
              ? original.current.version + 1
              : original.current.version,
        };
        savingNow.current = true;
        setSaving(true);
        attemptedSave.current = saved;
        return (await callbacks.current.onSave(saved, intent)) || saved;
      },
      acknowledge: (persisted, snapshot, intent) => {
        original.current = persisted;
        baseline.current = persisted;
        const next =
          contentSignature(current.current) === contentSignature(snapshot)
            ? persisted
            : {
                ...current.current,
                revision: persisted.revision,
                publishedRevision: persisted.publishedRevision,
                publishedSignature: persisted.publishedSignature,
                version: persisted.version,
              };
        current.current = next;
        setC(next);
        if (intent === "published") {
          callbacks.current.refresh = false;
          setRefresh(false);
          notify(
            `${persisted.kind === "doc" ? "Doc" : persisted.kind === "brief" ? "Update" : "Course"} published.`,
          );
        }
        setSavedMessage("Saved");
      },
      failed: (failure) => setError((failure as Error).message),
    });
  const [assignmentSave, setAssignmentSave] = useState(0);
  const appliedAssignmentSave = useRef(0);
  const latestAssignmentContent = data.content.find((item) => item.id === c.id);
  useEffect(() => {
    if (
      assignmentSave === appliedAssignmentSave.current ||
      !latestAssignmentContent
    )
      return;
    appliedAssignmentSave.current = assignmentSave;
    // Governance reads may project out lesson/body fields. Refresh assignment
    // metadata and the save queue's revision without replacing editorial work.
    const metadata = {
      revision: latestAssignmentContent.revision,
      publishedRevision: latestAssignmentContent.publishedRevision,
      publishedSignature: latestAssignmentContent.publishedSignature,
      assignments: latestAssignmentContent.assignments,
      groups: latestAssignmentContent.groups,
    };
    baseline.current = { ...baseline.current, ...metadata };
    original.current = { ...original.current, ...metadata };
    current.current = { ...current.current, ...metadata };
    queue.current!.reset(baseline.current);
    setC(current.current);
  }, [assignmentSave, latestAssignmentContent]);
  const signature = contentSignature(c);
  const observedSignature = useRef(signature);
  if (observedSignature.current !== signature) {
    observedSignature.current = signature;
    queue.current.markEdited();
  }
  const dirty = signature !== contentSignature(baseline.current);
  const needsRecovery = queue.current.blocked;
  async function flushDraft(intent: SaveIntent = "draft") {
    if (pendingUploads.current || recoveringNow.current) return false;
    const result = await queue.current!.flush(intent);
    savingNow.current = false;
    setSaving(false);
    return result;
  }
  useEffect(() => {
    if (!dirty || busy || queue.current!.blocked) return;
    const timer = setTimeout(() => {
      void flushDraft();
    }, 900);
    return () => clearTimeout(timer);
  }, [c, dirty, busy, saving]);
  useEditorLayout(form);
  const guard = useRef(async () => true);
  guard.current = async () => {
    if (pendingUploads.current || recoveringNow.current) return false;
    if (
      !queue.current!.blocked &&
      (queue.current!.dirty() || savingNow.current)
    ) {
      if (await flushDraft()) return true;
    }
    return (
      (!queue.current!.dirty() && !queue.current!.blocked) ||
      (await confirm(
        "Leave with unsaved changes? Cancel to keep editing or download your draft before leaving. Changes already saved are kept.",
      ))
    );
  };
  const registerAssignmentGuard = useNestedNavigationGuard(
    () => guard.current(),
    dirty || busy || saving || needsRecovery,
    registerNavigationGuard,
  );
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
    ? async (file, onProgress) => {
        pendingUploads.current++;
        setUploadCount(pendingUploads.current);
        try {
          return await onUpload(file, onProgress);
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
    if (!onReload || busy || recoveringNow.current || savingNow.current) return;
    recoveringNow.current = true;
    setRecovering(true);
    try {
      const latest = (await onReload()).content.find(
        (item) => item.id === c.id,
      );
      if (!latest) {
        throw new Error("No saved draft is available. Your changes remain open. Try saving again or download your changes.");
      }
      if (
        !(await confirm(
          "Replace your open changes with the latest saved draft? Your open changes will be discarded. Cancel to keep them or download your changes first.",
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
      setSavedMessage("Saved");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      recoveringNow.current = false;
      setRecovering(false);
    }
  }
  async function retrySaving() {
    if (!onReload || busy || recoveringNow.current || savingNow.current) return;
    recoveringNow.current = true;
    setRecovering(true);
    let ready = false;
    try {
      const latest = (await onReload()).content.find((item) => item.id === current.current.id);
      const next = resumeDraft(current.current, baseline.current, attemptedSave.current, latest);
      if (latest) {
        original.current = latest;
        baseline.current = latest;
      }
      queue.current!.reset(latest || baseline.current);
      // A lost Publish acknowledgement must never cause another publication or version bump.
      if (latest?.publishedSignature === contentSignature(attemptedSave.current || baseline.current))
        setRefresh(false);
      current.current = next;
      setC(next);
      setError("");
      ready = true;
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      recoveringNow.current = false;
      setRecovering(false);
    }
    if (ready && await flushDraft()) setSavedMessage("Saved");
  }
  async function restorePublished() {
    if (!onReload || !onLoadPublished || busy || recoveringNow.current || savingNow.current || queue.current!.blocked) return;
    recoveringNow.current = true;
    setRecovering(true);
    try {
      if (!await confirm("Discard your unpublished changes and restore the published version? The restored draft will save automatically. Readers will continue seeing the same published content.")) return;
      const latest = (await onReload()).content.find((item) => item.id === current.current.id);
      if (!latest || latest.revision !== baseline.current.revision) {
        queue.current!.block();
        throw new Error("The saved draft changed in another session. Load the saved draft before continuing. Your changes remain open.");
      }
      const published = await onLoadPublished(latest.id);
      // Check the publication and write revision together; never overwrite a concurrent edit.
      if (published.revision !== latest.revision ||
          published.publishedRevision !== latest.publishedRevision) {
        queue.current!.block();
        throw new Error("The saved draft changed in another session. Load the saved draft before continuing. Your changes remain open.");
      }
      const next = revertToPublished(latest, published, !!onWorkspaceChange);
      original.current = latest;
      baseline.current = latest;
      queue.current!.reset(latest);
      current.current = next;
      setC(next);
      setRefresh(false);
      setError("");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      recoveringNow.current = false;
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
  type Requirement = {
    id: string;
    message: string;
    field?: string;
    step?: string;
    questionId?: string;
    target?: "title" | "body";
  };
  const requirements: Requirement[] = [];
  if (!c.title.trim())
    requirements.push({
      id: "title",
      message: "Add a title",
      field: "editor-title",
    });
  if (!c.summary.trim())
    requirements.push({
      id: "summary",
      message: "Add a short description",
      field: "writing-summary",
    });
  if (
    !c.category.trim() ||
    (c.kind === "doc" && !sectionForDoc(c, docSections))
  )
    requirements.push({
      id: "organization",
      message: c.kind === "doc" ? "Choose a Docs section" : "Choose a category",
      field: "writing-organization",
    });
  if (c.kind !== "doc") {
    const art = resolvedCardArt(c.id, c.title, c.cardArt, c.coverImageUrl);
    if (
      (art.source === "generated" && !art.shortTitle.trim()) ||
      graphemeCount(art.shortTitle.trim()) > 40
    )
      requirements.push({
        id: "art-title",
        message: "Give artwork a short title of up to 40 characters",
        field: "content-artwork-title",
      });
    if (art.source === "upload" && !art.imageUrl)
      requirements.push({
        id: "art-image",
        message: "Upload a card image",
        field: "content-artwork",
      });
  }
  if (c.kind === "course") {
    if (!c.lessons.length)
      requirements.push({
        id: "lessons",
        message: "Add a lesson",
        step: "outline",
      });
    for (const [index, lesson] of c.lessons.entries()) {
      const label = `Lesson ${index + 1}`;
      if (!lesson.title.trim())
        requirements.push({
          id: `${lesson.id}-title`,
          message: `${label}: add a title`,
          step: lesson.id,
          target: "title",
        });
      if (!lesson.body.trim() && !lesson.videoUrl)
        requirements.push({
          id: `${lesson.id}-body`,
          message: `${label}: add content`,
          step: lesson.id,
          target: "body",
        });
      if (lesson.videoUrl && !videoSource(lesson.videoUrl))
        requirements.push({
          id: `${lesson.id}-video`,
          message: `${label}: use a supported HTTPS video URL`,
          step: lesson.id,
        });
      if (hasMissingImageAlt(lesson.body))
        requirements.push({
          id: `${lesson.id}-alt`,
          message: `${label}: add image alternative text`,
          step: lesson.id,
          target: "body",
        });
    }
    for (const [index, question] of c.questions.entries())
      if (!validQuestion(question))
        requirements.push({
          id: question.id,
          message: `Quiz question ${index + 1}: complete the question and answers`,
          step: "quiz",
          questionId: question.id,
        });
    const live = data.publishedContent?.find((item) => item.id === c.id);
    if (!refresh && live && requiresPassing(c) !== requiresPassing(live))
      requirements.push({
        id: "version",
        message: "Publish a new version for the changed completion rule",
        field: "course-version",
      });
  }
  function revealRequirement(item: Requirement) {
    if (item.step) {
      setRevealStep({
        id: item.step,
        request: Date.now(),
        target: item.target,
        questionId: item.questionId,
      });
    } else if (item.field?.startsWith("editor-")) {
      const field = document.getElementById(item.field);
      if (field) revealEditorTarget(field);
    } else {
      setDetailsReveal((current) => ({
        request: (current?.request || 0) + 1,
        field: item.field,
      }));
    }
  }
  const requirement = requirements[0];
  const publicationChanged =
    !c.publishedRevision ||
    hasUnpublishedEdits(
      c,
      data.publishedContent?.find((item) => item.id === c.id),
    ) ||
    refresh;
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
    try {
      await flushDraft(intent);
    } finally {
      if (intent === "published") {
        publishingNow.current = false;
        setPublishing(false);
      }
    }
  }
  const set = (key: string, value: unknown) =>
    setC((prev) => ({ ...prev, [key]: value }));
  const saveStatus = saving || busy
    ? uploadCount ? "Uploading…" : "Saving…"
    : queue.current!.blocked ? "Changes not saved"
    : dirty ? "Saving…" : savedMessage || (existing ? "Saved" : "Not saved");
  const details = (
    <FieldGroup disabled={busy} className="editor-details-content">
      <EditorDetailsGroup id="writing-readiness" title="Before publishing">
        {requirements.length ? (
          <ul className="grid gap-2">
            {requirements.map((item) => (
              <li key={item.id}>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto justify-start whitespace-normal p-0 text-left font-normal"
                  onClick={() => revealRequirement(item)}
                >
                  {item.message}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-copy text-muted-foreground">
            {publicationChanged
              ? "Ready to publish."
              : "Published version is current."}
          </p>
        )}
        <FieldDescription>
          Drafts save automatically. Publish when ready for readers.
        </FieldDescription>
      </EditorDetailsGroup>
      <EditorDetailsGroup id="writing-summary" title="Short description">
        <FormField label="Short description" visuallyHiddenLabel>
          <Textarea
            id="editor-summary"
            size="compact"
            rows={3}
            maxLength={300}
            value={c.summary}
            onChange={(event) => set("summary", event.target.value)}
            placeholder={
              c.kind === "course"
                ? "What will people learn?"
                : "What will people find here?"
            }
          />
        </FormField>
      </EditorDetailsGroup>
      <EditorDetailsGroup
        id="writing-organization"
        title={c.kind === "doc" ? "Docs section" : "Category"}
      >
        {c.kind === "doc" ? (
          <>
            <DocSectionPicker
              sections={docSections}
              canCreate={!!onWorkspaceChange}
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
            {onWorkspaceChange && (
              <Button
                type="button"
                disabled={busy}
                onClick={() => setCreatingSection((open) => !open)}
              >
                <Plus aria-hidden="true" />
                {creatingSection ? "Close section form" : "Create section"}
              </Button>
            )}
            {creatingSection && (
              <DocSectionCreate
                sections={docSections}
                disabled={busy || !onWorkspaceChange}
                onCancel={() => setCreatingSection(false)}
                onCreate={async (section) => {
                  if (!onWorkspaceChange)
                    throw new Error("Section settings are unavailable.");
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
      {c.kind !== "doc" && (c.kind === "brief" || onLearning) && (
        <EditorDetailsGroup
          id="content-assignments"
          title="Audience"
          description={
            c.kind === "brief"
              ? "Appears in For you. No completion requirement or due date. Publish audience changes to make them live."
              : "Appears in For you and counts toward assigned learning. Due dates follow organization settings."
          }
        >
          {c.kind === "brief" ? (
            <LearningAssignmentPicker
              data={data}
              item={{ kind: "brief", id: c.id }}
              title={c.title || "Untitled update"}
              draftAudiences={updateAudienceKeys(c)}
              showPeople={!!onWorkspaceChange}
              onPrepare={
                onWorkspaceChange
                  ? async () => {
                      if (!(await guard.current())) return null;
                      return onPrepareAssignments
                        ? onPrepareAssignments()
                        : data;
                    }
                  : undefined
              }
              onDraftChange={(keys) =>
                setC((current) => ({
                  ...current,
                  groups: keys
                    .filter((key) => key.startsWith("group:"))
                    .map((key) => key.slice(6)),
                  updateTeams: onWorkspaceChange
                    ? keys
                        .filter((key) => key.startsWith("team:"))
                        .map((key) => key.slice(5))
                    : current.updateTeams,
                }))
              }
              registerNavigationGuard={registerAssignmentGuard}
            />
          ) : existing &&
            (data.publishedContent ?? data.content).some(
              (item) => item.id === c.id && item.status === "published",
            ) &&
            onWorkspaceChange ? (
            <LearningAssignmentPicker
              data={data}
              item={{ kind: "course", id: c.id }}
              title={c.title}
              onChange={async (next, options) => {
                await onWorkspaceChange(next, options);
                setAssignmentSave((count) => count + 1);
              }}
              registerNavigationGuard={registerAssignmentGuard}
              onPrepare={async () => {
                if (!(await guard.current())) return null;
                return onPrepareAssignments ? onPrepareAssignments() : data;
              }}
            />
          ) : (
            <p className="text-copy text-muted-foreground">
              Publish this course to assign it to teams or groups.
            </p>
          )}
        </EditorDetailsGroup>
      )}
      {c.kind !== "doc" && (
        <div id="content-artwork" className="editor-details-group">
          <CardArtEditor
            id={c.id}
            title={c.title}
            kind={c.kind}
            category={c.category}
            art={c.cardArt}
            shortTitleId="content-artwork-title"
            legacyCover={c.coverImageUrl}
            settings={data.settings}
            onUpload={upload}
            disabled={busy}
            saveMode="automatic"
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
        </div>
      )}
      {c.kind === "course" && (
        <>
          <EditorDetailsGroup id="course-duration" title="Course details">
            <FormField label="Estimated minutes">
              <Input
                type="number"
                min={1}
                max={600}
                value={c.duration}
                onChange={(event) =>
                  set("duration", Number(event.target.value))
                }
              />
            </FormField>
          </EditorDetailsGroup>
          {existing && (
            <EditorDetailsGroup id="course-version" title="Publishing">
              <Field orientation="horizontal">
                <Checkbox
                  checked={refresh}
                  disabled={saving}
                  aria-describedby="course-version-help"
                  onCheckedChange={(checked) => setRefresh(checked === true)}
                />
                Publish a new version and start a new completion window
              </Field>
              <FieldDescription id="course-version-help">
                Current version: {c.version}. Keep this unchecked for minor
                corrections.
              </FieldDescription>
            </EditorDetailsGroup>
          )}
        </>
      )}
      {!!c.publishedRevision && <ActionGroup>
        <Button type="button" variant="outline" size="sm"
          disabled={busy || saving || needsRecovery || !publicationChanged || !onLoadPublished || !onReload}
          onClick={() => void restorePublished()}>Revert to published version</Button>
      </ActionGroup>}
    </FieldGroup>
  );
  return (
    <form
      ref={form}
      className="editor"
      data-scroll-layout="page"
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
      <div className="editor-heading">
        <h1 className="sr-only">
          {c.kind === "doc" ? "Doc" : c.kind === "brief" ? "Update" : "Course"}{" "}
          editor
        </h1>
        <DetailNavigation
          flush
          compact
          disabled={busy}
          items={[
            {
              label: "Back to content",
              onSelect: async () => {
                if (await guard.current()) onCancel();
              },
            },
          ]}
        />
        <div className="editor-heading-actions">
          <EditorSaveStatus
            status={saveStatus}
            published={!!c.publishedRevision}
            hasUnpublishedChanges={!!c.publishedRevision && publicationChanged}
            failed={needsRecovery}
          />
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            disabled={
              busy ||
              publishing ||
              queue.current!.blocked ||
              !publicationChanged ||
              requirements.length > 0
            }
            onClick={(event) => void submit(event, "published")}
          >
            Publish
          </Button>
        </div>
      </div>
      {error && (
        <Alert variant="destructive" role="alert" className={needsRecovery ? "text-foreground" : undefined}>
          {needsRecovery && <>
            <p className="font-medium text-copy">We couldn’t confirm your latest changes were saved.</p>
            <p className="text-xs text-muted-foreground">Your work is still here. Keep this page open.</p>
          </>}
          <p className={needsRecovery ? "text-xs text-muted-foreground" : undefined}>{error}</p>
          {needsRecovery && <ActionGroup className="mt-1 gap-x-4 gap-y-2">
            {onReload && <Button type="button" size="sm" disabled={busy || saving}
              onClick={() => void retrySaving()}>Retry saving</Button>}
            <Button type="button" variant="link" size="sm" className="text-xs text-muted-foreground underline" onClick={downloadDraft}>
              Download your changes
            </Button>
            {onReload && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="text-xs text-muted-foreground underline"
                disabled={busy}
                onClick={reloadSaved}
              >
                Load saved draft
              </Button>
            )}
          </ActionGroup>}
        </Alert>
      )}
      {busy && (
        <p role="status">
          {uploadCount
            ? "Uploading media. Keep this page open until the draft is saved."
            : "Saving or refreshing. Keep this page open."}
        </p>
      )}
      <FieldGroup disabled={busy} className="editor-content flex min-h-0 flex-col">
        <section
          className="editor-introduction"
          aria-label={
            c.kind === "course" ? "Course introduction" : "Content introduction"
          }
        >
          <FormField label="Title" visuallyHiddenLabel>
            <Input
              id="editor-title"
              variant="title"
              maxLength={160}
              value={c.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder={`Untitled ${c.kind === "doc" ? "doc" : c.kind === "brief" ? "update" : "course"}`}
            />
          </FormField>
        </section>
        {c.kind === "course" ? (
          <CourseBuilder
            course={c}
            details={details}
            requirementsCount={requirements.length}
            revealDetails={detailsReveal}
            incompleteSteps={[
              ...new Set(
                requirements.flatMap((item) => (item.step ? [item.step] : [])),
              ),
            ]}
            revealStep={revealStep}
            onChange={(updater) => setC(updater)}
            onUpload={upload}
            disabled={busy}
          />
        ) : (
          <EditorFrame
            details={details}
            requirementsCount={requirements.length}
            revealDetails={detailsReveal}
            disabled={busy}
          >
            <WritingEditor
              label={c.kind === "doc" ? "Doc content" : "Update content"}
              value={c.body}
              onChange={(value) => set("body", value)}
              onUpload={upload}
              disabled={busy}
            />
          </EditorFrame>
        )}
      </FieldGroup>
    </form>
  );
}
