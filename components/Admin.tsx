"use client";
import { compareOptionalDates, sortLabels } from "@/lib/collection-sort";
import { SortPicker } from "./patterns/sort-picker";
import { useOrganizationChangeReview } from "./OrganizationChangeReview";
import { DetailNavigation } from "./patterns/detail-navigation";
import { EditorSaveStatus } from "./patterns/editor-save-status";
import { Badge } from "./ui/badge";
import { Spinner } from "./ui/spinner";
import { Pagination } from "./patterns/pagination";
import { contentRelationshipCommands } from "./bulk-relationships";
import type { BulkHandler } from "@/lib/bulk-actions";
import { AdminBulkActions, adminCommands } from "./AdminBulkActions";
import { RecentlyDeleted } from "./RecentlyDeleted";
import { PeopleBulkActions, peopleCommands } from "./PeopleBulkActions";
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
import { WritingTitle } from "./patterns/writing-title";
import { useEditorLayout } from "./patterns/use-editor-layout";
import { useCollapseDesktopSidebar } from "./patterns/desktop-sidebar-state";
import { hasMissingImageAlt } from "@/lib/markdown-compatibility";
import { createDraftSaveQueue, type SaveIntent } from "@/lib/draft-save-queue";
import type { PublicationOptions } from "@/lib/content-publication";
import { contentSignature, hasUnpublishedEdits } from "@/lib/demo-publication";
import { resumeDraft, revertToPublished } from "@/lib/draft-recovery";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { MoreHorizontal, RotateCcw } from "lucide-react";
import { EditorAppHeader } from "./patterns/editor-app-header";
import { PublicationStatus } from "./patterns/publication-status";
import { FieldDescription } from "./ui/field";
import { FormField } from "@/components/patterns/form-field";
import { FilterOptions } from "./patterns/filter-options";
import { useToast } from "./ui/toast";
import { RecordName, RecordMeta, RecordValues } from "./patterns/record-row";
import { ItemActions } from "./patterns/bulk-actions";
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
import { assignLearningToAudiences, assignmentAudiences } from "@/lib/assignment-audiences";
import { expandLearning } from "@/lib/learning-groups";
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
import { onboardingClockTarget } from "@/lib/learning";
import { PendingPeople } from "./PendingPeople";
import { PersonFields } from "./PersonFields";
import { ScrollRegion } from "./patterns/scroll-region";
import { RosterImport } from "./RosterImport";
import {
  adminHref,
  parseAdminDestination,
  type AdminDestination,
  type AdminTab,
} from "@/lib/admin-destination";
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
import { SaveChangesControl } from "./patterns/save-changes-control";
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
        id: "curricula",
        name: "Curricula",
        description: "Build reusable course lists.",
        icon: Layers,
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
    label: "People & Progress",
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
        name: "Groups",
        description: "Manage people, assigned courses, and relevant updates.",
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
        id: "settings-access",
        name: "Access",
        description: "Manage browsing access and account registration.",
        icon: Users,
      },
      {
        id: "settings-docs",
        name: "Docs navigation",
        description: "Arrange sections, subsections and documents for Docs.",
        icon: FileText,
      },
      {
        id: "settings-links",
        name: "External links",
        description: "Add up to three links to everyone’s account menu.",
        icon: Settings,
      },
      {
        id: "settings-courses",
        name: "Due dates",
        description: "Choose whether group-selected courses have due dates.",
        icon: Layers,
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
        id: "settings-privacy",
        name: "Privacy",
        description: "Maintain and publish your organization’s privacy policy.",
        icon: FileText,
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
  initialDestination?: AdminDestination;
  onWriteDestination?: (
    destination: AdminDestination,
    replace?: boolean,
  ) => Promise<boolean>;
  onLoadDestination?: (destination: AdminDestination) => Promise<Workspace>;
  onBulk: BulkHandler;
  data: Workspace;
  user: User;
  onImported?: () => Promise<void>;
  onDeleteFeedback?: (ids: string[]) => Promise<void>;
  onOpenTab?: (tab: string) => Promise<void>;
  onPrepareAssignments?: () => Promise<Workspace>;
  onOpenPersonProgress?: (id: string) => Promise<void>;
  onEdit?: (id: string) => Promise<Content>;
  onSaveContent?: (content: Content, intent: SaveIntent, options?: PublicationOptions) => Promise<Content>;
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
  onSaveDocsNavigation?: import("@/lib/docs-navigation-save").SaveDocsNavigation;
  onSaveSettings?: (
    before: Workspace,
    settings: import("@/lib/settings").SiteSettings,
  ) => Promise<Workspace>;
  onReviewDeadlines?: (
    token?: string,
  ) => Promise<import("@/lib/assignment-episodes").DeadlineReview>;
  onLoadPublished?: (id: string) => Promise<Content>;
};
const id = () => crypto.randomUUID();
const contentDateMonths = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function formatContentDate(value?: string) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "—";
  // A fixed UTC date keeps server and browser output identical.
  return `${String(date.getUTCDate()).padStart(2, "0")}-${contentDateMonths[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}
function initialContent(
  destination: AdminDestination,
  data: Workspace,
): Content | null {
  if (destination.tab !== "content") return null;
  if (destination.id)
    return data.content.find((item) => item.id === destination.id) || null;
  const kind = destination.create;
  if (!kind || !["doc", "brief", "course"].includes(kind)) return null;
  return {
    id: id(),
    kind: kind as Content["kind"],
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
  };
}
function initialPerson(
  destination: AdminDestination,
  data: Workspace,
): User | null {
  if (destination.tab !== "people") return null;
  if (destination.create === "person")
    return {
      id: id(),
      name: "",
      email: "",
      role: "learner",
      active: true,
      groups: [],
    };
  return destination.view === "edit"
    ? structuredClone(
        data.users.find((person) => person.id === destination.id) || null,
      )
    : null;
}
export default function Admin({
  initialDestination = { tab: "content" },
  onWriteDestination,
  onLoadDestination,
  onBulk,
  data,
  user,
  onImported,
  onDeleteFeedback,
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
  onSaveDocsNavigation,
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
  const [destination, setDestination] = useState(initialDestination);
  const destinationRef = useRef(initialDestination);
  const navigationBusy = useRef(false);
  const writingHistory = useRef(false);
  const [tab, setTab] = useState<string>(initialDestination.tab),
    [openingTab, setOpeningTab] = useState<string | null>(null),
    [openingItem, setOpeningItem] = useState<string | null>(null),
    [editing, setEditing] = useState<Content | null>(() =>
      initialContent(initialDestination, data),
    ),
    [person, setPerson] = useState<User | null>(() =>
      initialPerson(initialDestination, data),
    ),
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
    } | null>(() =>
      initialDestination.tab === "people" &&
      initialDestination.id &&
      !initialDestination.view
        ? { userId: initialDestination.id }
        : null,
    );
  const [contentStatus, setContentStatus] = useState("all"),
    [contentSection, setContentSection] = useState("all"),
    [page, setPage] = useState(1);
  const [personBusy, setPersonBusy] = useState(false);
  const [personError, setPersonError] = useState("");
  const personBaseline = useRef<User | null>(
    person ? structuredClone(person) : null,
  );
  const personSaving = useRef(false);
  const personDirty = !!person && !equalJson(person, personBaseline.current);
  const personGuard = useRef(async () => true);
  personGuard.current = async () =>
    !personSaving.current &&
    (!personDirty || (await confirm("Discard unsaved profile changes?")));
  function openPerson(value: User) {
    void navigateDestination(
      data.users.some((person) => person.id === value.id)
        ? { tab: "people", id: value.id, view: "edit" }
        : { tab: "people", create: "person" },
    );
  }
  async function closePerson() {
    if (await personGuard.current())
      await navigateDestination({ tab: "people" }, { approved: true });
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
  async function navigateDestination(
    next: AdminDestination,
    options: { approved?: boolean; history?: boolean; replace?: boolean } = {},
  ) {
    if (!canOpenAdminTab(user, next.tab) || navigationBusy.current)
      return false;
    if (!options.approved && !options.history) {
      if (
        profileNavigationGuard.current &&
        !(await profileNavigationGuard.current())
      )
        return false;
      if (adminGuard.current && !(await adminGuard.current())) return false;
    }
    navigationBusy.current = true;
    const previous = destinationRef.current;
    setOpeningTab(next.id ? null : next.tab);
    setOpeningItem(next.id || null);
    try {
      const loaded = onLoadDestination ? await onLoadDestination(next) : data;
      if (next.id) {
        const collection =
          next.tab === "content"
            ? loaded.content
            : next.tab === "people"
              ? loaded.users
              : next.tab === "teams"
                ? loaded.teams
                : next.tab === "groups"
                  ? loaded.groups
                  : next.tab === "progress" ? loaded.progressReport?.people.map((person) => person.u) || loaded.users : loaded.curricula;
        if (!collection?.some((item) => item.id === next.id))
          throw new Error(
            "This item is no longer available. Open its list to choose another item.",
          );
      }
      destinationRef.current = next;
      if (
        !options.history &&
        onWriteDestination &&
        !(await onWriteDestination(next, options.replace))
      ) {
        destinationRef.current = previous;
        return false;
      }
      if (next.tab !== tab) { setQuery(""); setPage(1); }
      setDestination(next);
      setTab(next.tab);
      setEditing(initialContent(next, loaded));
      const profile = initialPerson(next, loaded);
      personBaseline.current = profile ? structuredClone(profile) : null;
      setPerson(profile);
      setPersonError("");
      setDetailScope(
        next.tab === "people" && next.id && !next.view
          ? { userId: next.id }
          : null,
      );
      setNotice("");
      adminPanel.reveal(false);
      return true;
    } catch (error) {
      destinationRef.current = previous;
      if (options.history && onWriteDestination)
        await onWriteDestination(previous, true);
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not open this destination. Try again.",
      );
      return false;
    } finally {
      navigationBusy.current = false;
      setOpeningTab(null);
      setOpeningItem(null);
    }
  }
  const restoreDestination = useRef(() => {});
  restoreDestination.current = () => {
    if (writingHistory.current) return;
    const path = production
      ? window.location.pathname
      : "/" + window.location.hash.slice(1).split("?")[0];
    const next = parseAdminDestination(path);
    if (next && adminHref(next) !== adminHref(destinationRef.current))
      void navigateDestination(next, { history: true });
  };
  useEffect(() => {
    window.addEventListener(
      production ? "popstate" : "fieldbook:admin-history",
      restore,
    );
    function restore() {
      restoreDestination.current();
    }
    return () => {
      window.removeEventListener(
        production ? "popstate" : "fieldbook:admin-history",
        restore,
      );
    };
  }, [production]);
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
    .sort((a, b) => {
      const title = a.title.localeCompare(b.title);
      const dates = contentSort.startsWith("created")
        ? compareOptionalDates(
            a.createdAt,
            b.createdAt,
            contentSort === "created",
          )
        : contentSort === "updated" || contentSort === "oldest"
          ? compareOptionalDates(
              a.updatedAt,
              b.updatedAt,
              contentSort === "updated",
            )
          : 0;
      return (
        dates ||
        (contentSort === "title-desc" ? -title : title) || a.id.localeCompare(b.id)
      );
    });
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
    .sort((a, b) => {
      const name = a.name.localeCompare(b.name);
      return (
        (peopleSort === "recent" || peopleSort === "added-oldest"
          ? compareOptionalDates(a.addedAt, b.addedAt, peopleSort === "recent")
          : 0) ||
        (peopleSort === "reverse" ? -name : name) ||
        a.id.localeCompare(b.id)
      );
    });
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
    void navigateDestination({ tab: "content", create: kind });
  }
  async function savedDestination(content: Content) {
    if (!destinationRef.current.create) return;
    const next: AdminDestination = {
      tab: "content",
      id: content.id,
      view: "edit",
    };
    writingHistory.current = true;
    try {
      await onWriteDestination?.(next, true);
      destinationRef.current = next;
      setDestination(next);
    } finally {
      writingHistory.current = false;
    }
  }
  async function save(c: Content, intent: SaveIntent = "draft", options?: PublicationOptions) {
    if (onSaveContent) {
      const saved = await onSaveContent(c, intent, options);
      await savedDestination(saved);
      return saved;
    }
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

    await savedDestination(updated);
    setNotice("");
    // The server may normalize the draft while saving. Keep the editor's
    // baseline on the persisted revision so a second publish is not treated
    // as a concurrent edit.
    return production && onEdit ? await onEdit(c.id) : updated;
  }
  async function savePerson(e: React.FormEvent) {
    e.preventDefault();
    if (!person || personSaving.current || !personDirty) return;
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
      addedAt: previous ? previous.addedAt : new Date().toISOString(),
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
      await navigateDestination({ tab: "people" }, { approved: true });
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
        {notice && <Alert variant="destructive" onDismiss={() => setNotice("")}>{notice}</Alert>}
        <Editor
          key={editing.id}
          content={editing}
          data={data}
          onSave={save}
          onCancel={() => {
            void navigateDestination({ tab: "content" }, { approved: true });
          }}
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
              : "Back to groups",
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
              await navigateDestination({ tab: "people" }, { approved: true });
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
              await navigateDestination({ tab: "groups", id: groupId });
            }}
          />
        </>
      )}
    </div>
  );

  const recordHref = (destination: AdminDestination) => production ? adminHref(destination) : `#${adminHref(destination).slice(1)}`;
  const contentEditHref = (id: string) => recordHref({ tab: "content", id, view: "edit" });

  function contentActions(
    c: Workspace["content"][number],
    assign?: { onClick: () => void; loading: boolean },
  ) {
    return (
      <ItemActions
        id={c.id}
        label={c.title || "Untitled"}
        disabled={openingItem === c.id || assign?.loading}
        onSelectionChange={(ids) => {
          if (!ids.length)
            selection.setSelected(
              selection.selected.filter((id) => id !== c.id),
            );
        }}
        actions={[
          {
            label: "Edit",
            onSelect: () => {
              void navigateDestination({
                tab: "content",
                id: c.id,
                view: "edit",
              });
            },
          },
        ]}
        commands={adminCommands({
          data,
          selected: [c.id],
          onBulk,
          extraCommands: admin
            ? contentRelationshipCommands(
                data,
                [c.id],
                onChange,
                manageLearningMany,
                assignmentPicker.open,
              )
            : [],
        }).filter((command) =>
          command.id === "unpublish" ? !!c.publishedRevision :
          command.id === "publish" ? !c.publishedRevision || hasUnpublishedEdits(c, production ? undefined : data.publishedContent?.find((live) => live.id === c.id)) : true,
        ).map((command) => command.id === "publish" && c.publishedRevision ? { ...command, itemLabel: "Publish changes" } : command)}
      />
    );
  }

  async function changeAdminTab(next: string, approved = false) {
    if (next === tab && !destination.id && !destination.create) return false;
    return navigateDestination({ tab: next as AdminTab }, { approved });
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
            {notice && <Alert variant="destructive" onDismiss={() => setNotice("")}>{notice}</Alert>}
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
                onSaveDocsNavigation={onSaveDocsNavigation}
              />
            ) : tab === "feedback" ? (
              <FeedbackAdmin data={data} onDeleteFeedback={admin ? onDeleteFeedback : undefined} />
            ) : tab === "teams" ? (
              <TeamsAdmin
                key={adminHref(destination)}
                initialTeam={destination.id}
                initialTab={destination.panel}
                onDestinationChange={(id, panel) =>
                  navigateDestination(
                    { tab: "teams", ...(id ? { id, panel } : {}) },
                    { approved: true },
                  )
                }
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
                  sort={
                    <SortPicker
                      label="Sort content"
                      value={contentSort}
                      onValueChange={setContentSort}
                    >
                      <option value="created">{sortLabels.createdNewest}</option>
                      <option value="created-oldest">{sortLabels.createdOldest}</option>
                      <option value="title">{sortLabels.titleAsc}</option>
                      <option value="title-desc">{sortLabels.titleDesc}</option>
                      <option value="updated">{sortLabels.updatedNewest}</option>
                      <option value="oldest">{sortLabels.updatedOldest}</option>
                    </SortPicker>
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
                    <DataTable layout="contentSelection" density="compact">
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
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead>Created</TableHead>
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
                              <RecordName
                                disabled={openingItem === c.id}
                                href={contentEditHref(c.id)}
                                onNavigate={() => void navigateDestination({ tab: "content", id: c.id, view: "edit",
                                  })}
                              >
                                {c.title || "Untitled"}
                              </RecordName>
                              <RecordMeta>
                                {c.category}
                                {c.folder ? " / " + c.folder : ""}
                              </RecordMeta>
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
                            <TableCell>
                              {formatContentDate(c.updatedAt)} (v{c.version})
                            </TableCell>
                            <TableCell>
                              {formatContentDate(c.createdAt)}
                            </TableCell>
                            <TableCell>
                              {admin &&
                              c.kind === "course" &&
                              (!!c.publishedRevision || c.status === "published" || data.publishedContent?.some((live) => live.id === c.id && live.status === "published",
                                )) ? (
                                <LearningAssignmentPicker
                                  data={data}
                                  item={{ kind: "course", id: c.id }}
                                  title={c.title}
                                  compact
                                  renderTrigger={(trigger) =>
                                    contentActions(c, trigger)
                                  }
                                  onChange={onChange}
                                  onPrepare={onPrepareAssignments}
                                  registerNavigationGuard={registerAdminGuard}
                                />
                              ) : (
                                contentActions(c)
                              )}
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
                      ? "Manage everyone, including people who have not signed in. Deactivation preserves course history. Reassign managed teams before deactivating a manager. Deleting a manager leaves their teams unassigned."
                      : "Sample profiles for trying role-based assignments. No accounts or emails are created."}
                  </p>
                </Toolbar>
                <CollectionControls
                  filters={peopleFilters}
                  onClear={clearPeopleFilters}
                  sort={
                    <SortPicker
                      label="Sort profiles"
                      value={peopleSort}
                      onValueChange={setPeopleSort}
                    >
                      <option value="title">{sortLabels.nameAsc}</option>
                      <option value="reverse">{sortLabels.nameDesc}</option>
                      <option value="recent">{sortLabels.addedNewest}</option>
                      <option value="added-oldest">{sortLabels.addedOldest}</option>
                    </SortPicker>
                  }
                  search={
                    <FormField label="Search profiles" visuallyHiddenLabel>
                      <Input
                        id="admin-people-search"
                        name="admin-people-search"
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search users by name or email"
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
                    <DataTable layout="peopleSelection" density="compact">
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
                          <TableHead>User</TableHead>
                          <TableHead>Team</TableHead>
                          <TableHead>Access</TableHead>
                          <TableHead>Groups</TableHead>
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
                              <RecordName
                                href={recordHref({ tab: "people", id: u.id, view: "edit",
                                })}
                                onNavigate={() =>
                                  openPerson(structuredClone(u))
                                }
                              >
                                {u.name}
                              </RecordName>
                              <RecordMeta title={u.email}>{u.email}</RecordMeta>
                            </TableCell>
                            <TableCell>
                              {data.teams?.find(
                                (team) =>
                                  team.id ===
                                  reportingTeamId(u.teamId, data.teams),
                              )?.name || "No team"}
                            </TableCell>
                            <TableCell>{roleLabel(u.role)}</TableCell>
                            <TableCell>
                              <RecordValues
                                label="groups"
                                empty="No groups"
                                values={data.groups
                                  .filter((g) =>
                                    effectiveGroups(u, data.groups).has(g.id),
                                  )
                                  .map((g) => g.name)}
                              />
                            </TableCell>

                            <TableCell>
                              <ItemActions
                                id={u.id}
                                label={u.name}
                                noun="users"
                                onSelectionChange={(ids) => {
                                  if (!ids.length)
                                    selection.setSelected(
                                      selection.selected.filter(
                                        (id) => id !== u.id,
                                      ),
                                    );
                                }}
                                commands={adminCommands({
                                  data,
                                  selected: [u.id],
                                  entity: "user",
                                  onBulk,
                                  extraCommands: peopleCommands(
                                    data,
                                    [u.id],
                                    onChange,
                                    false,
                                    user.id,
                                  ),
                                }).filter(
                                  (command) =>
                                    command.id !==
                                    (u.active ? "active" : "inactive"),
                                )}
                                disabled={!!openingTab || !!openingItem}
                                actions={[
                                  {
                                    label: "Edit",
                                    onSelect: () =>
                                      openPerson(structuredClone(u)),
                                  },
                                  {
                                    label: "Progress",
                                    onSelect: async () => {
                                      setOpeningItem(u.id);
                                      try {
                                        await navigateDestination({
                                          tab: "people",
                                          id: u.id,
                                        });
                                        setNotice("");
                                        adminPanel.reveal();
                                      } catch (error) {
                                        setNotice((error as Error).message);
                                      } finally {
                                        setOpeningItem(null);
                                      }
                                    },
                                  },
                                ]}
                              />
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
                key={adminHref(destination)}
                initialCurriculum={destination.id}
                hrefForCurriculum={(id) =>
                  recordHref({ tab: "curricula", id, view: "edit" })
                }
                createNew={destination.create === "curriculum"}
                onDestinationChange={(id, create) =>
                  navigateDestination(
                    {
                      tab: "curricula",
                      ...(create
                        ? { create: "curriculum" as const }
                        : id
                          ? { id, view: "edit" as const }
                          : {}),
                    },
                    { approved: true },
                  )
                }
                data={data}
                onChange={onChange}
                onUpload={onUpload}
                onPrepareAssignments={onPrepareAssignments}
                registerNavigationGuard={registerAdminGuard}
              />
            ) : tab === "groups" ? (
              <LearningGroups
                key={adminHref(destination)}
                initialGroup={destination.id}
                hrefForGroup={(id) => recordHref({ tab: "groups", id })}
                initialTab={destination.panel}
                onDestinationChange={(id, panel) =>
                  navigateDestination(
                    { tab: "groups", ...(id ? { id, panel } : {}) },
                    { approved: true },
                  )
                }
                data={data}
                onChange={onChange}
                onLearning={manageLearning}
                onLearningMany={manageLearningMany}
                onPrepareAssignments={onPrepareAssignments}
                registerNavigationGuard={registerAdminGuard}
              />
            ) : (
              <TeamProgress
                data={data}
                user={user}
                initialPerson={destination.id}
                onDestinationChange={(id) =>
                  navigateDestination(
                    { tab: "progress", ...(id ? { id } : {}) },
                    { approved: true },
                  )
                }
              />
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
              <DialogTitle>
                {production ? "Account" : "Demo profile"}
              </DialogTitle>
              <DialogDescription>
                {production
                  ? person.registered === false
                    ? "This preregistered user can activate their account with verified Google sign-in. Email is read-only."
                    : "Changes apply to this verified account. Login email is read-only."
                  : "Use fictional details. This does not create a secure account."}
              </DialogDescription>
              <DialogBody>
                <ScrollRegion className="h-full p-1">
                  <FieldGroup disabled={personBusy}>
                    {personError && (
                      <Alert variant="destructive" onDismiss={() => setPersonError("")}>{personError}</Alert>
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
                <SaveChangesControl
                  dirty={personDirty}
                  busy={personBusy}
                >
                  <Save size={16} />
                  Save profile
                </SaveChangesControl>
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
    options?: PublicationOptions,
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
  useCollapseDesktopSidebar();
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
    [renewUpdate, setRenewUpdate] = useState(false),
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
  const attemptedRenewUpdate = useRef(false);
  const busy = uploadCount > 0 || recovering;
  const current = useRef(c);
  current.current = c;
  const callbacks = useRef({ onSave, data, refresh, renewUpdate });
  callbacks.current = { onSave, data, refresh, renewUpdate };
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
        attemptedRenewUpdate.current = intent === "published" && snapshot.kind === "brief" && callbacks.current.renewUpdate;
        return (await callbacks.current.onSave(saved, intent, {
          renewUpdate: attemptedRenewUpdate.current,
        })) || saved;
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
          callbacks.current.renewUpdate = false;
          setRefresh(false);
          setRenewUpdate(false);
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
        throw new Error(
          "No saved draft is available. Try saving again or download your changes.",
        );
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
      setRenewUpdate(false);
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
      const latest = (await onReload()).content.find(
        (item) => item.id === current.current.id,
      );
      const next = resumeDraft(
        current.current,
        baseline.current,
        attemptedSave.current,
        latest,
      );
      const publishedAttemptConfirmed = latest?.publishedSignature === contentSignature(attemptedSave.current || baseline.current) &&
        (!attemptedRenewUpdate.current ||
          (latest.publishedRevision || 0) > (attemptedSave.current?.revision || 0));
      if (latest) {
        original.current = latest;
        baseline.current = latest;
      }
      queue.current!.reset(latest || baseline.current);
      // A lost Publish acknowledgement must never cause another publication or version bump.
      if (publishedAttemptConfirmed) {
        setRefresh(false);
        setRenewUpdate(false);
      }
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
    if (ready && (await flushDraft())) setSavedMessage("Saved");
  }
  async function restorePublished() {
    if (!onReload || !onLoadPublished || busy || recoveringNow.current || savingNow.current || queue.current!.blocked) return;
    recoveringNow.current = true;
    setRecovering(true);
    try {
      if (
        !(await confirm(
          "Discard your unpublished changes and restore the published version? The restored draft will save automatically. Readers will continue seeing the same published content.",
        ))
      )
        return;
      const latest = (await onReload()).content.find(
        (item) => item.id === current.current.id,
      );
      if (!latest || latest.revision !== baseline.current.revision) {
        queue.current!.block();
        throw new Error(
          "Another session changed this draft. Load the saved draft before continuing.",
        );
      }
      const published = await onLoadPublished(latest.id);
      // Check the publication and write revision together; never overwrite a concurrent edit.
      if (published.revision !== latest.revision ||
          published.publishedRevision !== latest.publishedRevision) {
        queue.current!.block();
        throw new Error(
          "Another session changed this draft. Load the saved draft before continuing.",
        );
      }
      const next = revertToPublished(latest, published, !!onWorkspaceChange);
      original.current = latest;
      baseline.current = latest;
      queue.current!.reset(latest);
      current.current = next;
      setC(next);
      setRefresh(false);
      setRenewUpdate(false);
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
  if (c.kind !== "course" && !c.body.trim())
    requirements.push({
      id: "body",
      message: "Add content",
      field: "editor-body",
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
    refresh || renewUpdate;
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
  const audienceAssigned = c.kind === "brief"
    ? updateAudienceKeys(c).length > 0
    : c.kind === "course" && assignmentAudiences(data).some((audience) => expandLearning(audience.items, data.curricula || []).includes(c.id));
  const audienceLabel = audienceAssigned ? "Edit Audience" : "Assign audience";
  const details = (
    <FieldGroup disabled={busy} className="editor-details-content">
      {requirements.length > 0 && <EditorDetailsGroup id="writing-readiness" title="Before publishing">
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
      </EditorDetailsGroup>}
      <EditorDetailsGroup id="writing-summary" title="Short description">
        <FormField label="Short description" visuallyHiddenLabel description={`${c.summary.length}/300`}>
          <Textarea
            variant="metadata"
            id="editor-summary"
            size="compact"
            rows={3}
            maxLength={300}
            value={c.summary}
            onChange={(event) => set("summary", event.target.value.slice(0, 300))}
            placeholder="Max 300 characters…"
          />
        </FormField>
      </EditorDetailsGroup>
      <EditorDetailsGroup
        id="writing-organization"
        title={c.kind === "doc" ? "Section" : "Category"}
      >
        {c.kind === "doc" ? (
          <>
            <DocSectionPicker
              inputVariant="metadata"
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
            {onWorkspaceChange && !creatingSection && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setCreatingSection(true)}
              >
                <Plus aria-hidden="true" />
                Create section
              </Button>
            )}
            {creatingSection && (
              <DocSectionCreate
                inputVariant="metadata"
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
              variant="metadata"
              value={c.category}
              onValueChange={(value) => set("category", value)}
              options={data.content
                .filter((item) => item.kind === c.kind)
                .map((item) => item.category)}
              listLabel="Categories"
              visibleRows={5}
              placeholder="Choose or add category…"
            />
          </FormField>
        )}
      </EditorDetailsGroup>
      {c.kind !== "doc" && (
        <EditorDetailsGroup
          id="content-assignments"
          title="Audience"
        >
          {c.kind === "brief" ? (
            <LearningAssignmentPicker
              data={data}
              item={{ kind: "brief", id: c.id }}
              title={c.title || "Untitled update"}
              triggerLabel={audienceLabel}
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
              triggerLabel={audienceLabel}
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
            <div className="grid gap-2">
              <Button type="button" variant="outline" disabled>{audienceLabel}</Button>
              <FieldDescription>{!c.publishedRevision ? "Publish to assign an audience." : "Audience assignment requires an administrator."}</FieldDescription>
            </div>
          )}
        </EditorDetailsGroup>
      )}
      {c.kind === "course" && c.questions.length > 0 && (
        <EditorDetailsGroup id="course-quiz" title="Quiz">
          <Field orientation="horizontal">
            <Checkbox
              checked={requiresPassing(c)}
              disabled={busy}
              onCheckedChange={(checked) => set("requirePassing", checked === true)}
            />
            Require all answers correct to complete
          </Field>
        </EditorDetailsGroup>
      )}
      {c.kind !== "doc" && (
        <div id="content-artwork" className="editor-details-group">
          <CardArtEditor
            inputVariant="metadata"
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
          <EditorDetailsGroup id="course-duration" title="Duration">
            <FormField label="Estimated minutes">
              <Input
                variant="metadata"
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
          <EditorDetailsGroup id="course-version" title="Version">
            <FieldDescription>Current version: {c.version}</FieldDescription>
            {!!c.publishedRevision && (
              <>
                <Field orientation="horizontal">
                  <Checkbox
                    checked={refresh}
                    disabled={saving}
                    aria-describedby="course-version-help"
                    onCheckedChange={(checked) => setRefresh(checked === true)}
                  />
                  Publish new version and reassign to audiences.
                </Field>
                <FieldDescription id="course-version-help">
                  Keep this unchecked for minor corrections.
                </FieldDescription>
              </>
            )}
          </EditorDetailsGroup>
        </>
      )}
      {c.kind === "brief" && !!c.publishedRevision && (
        <EditorDetailsGroup id="update-publication" title="Updates feed">
          <Field orientation="horizontal">
            <Checkbox
              checked={renewUpdate}
              disabled={saving || publishing || needsRecovery}
              aria-describedby="update-publication-help"
              onCheckedChange={(checked) => setRenewUpdate(checked === true)}
            />
            Bring this update to the top
          </Field>
          <FieldDescription id="update-publication-help">
            Keep this unchecked for minor corrections.
          </FieldDescription>
        </EditorDetailsGroup>
      )}

    </FieldGroup>
  );
  const recovery = !!c.publishedRevision && (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="justify-start px-0 font-normal"
      disabled={
        busy ||
        saving ||
        needsRecovery ||
        !publicationChanged ||
        !onLoadPublished ||
        !onReload
      }
      onClick={() => void restorePublished()}
    >
      <RotateCcw aria-hidden="true" />
      Revert to published version
    </Button>
  );
  const canvasNavigation = (
        <DetailNavigation
          flush
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
  );
  return (
    <form
      ref={form}
      className="editor"
      data-kind={c.kind}
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
      <h1 className="sr-only">{c.kind === "doc" ? "Doc" : c.kind === "brief" ? "Update" : "Course"} editor</h1>
      <EditorAppHeader>
        <div className="editor-heading-actions">
          <EditorSaveStatus
            status={saveStatus}
            published={!!c.publishedRevision}
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
      </EditorAppHeader>
      {error && (
        <Alert
          variant="destructive"
          role="alert"
          className={needsRecovery ? "text-foreground" : undefined}
          onDismiss={() => setError("")}
        >
          {needsRecovery && (
            <>
              <p className="font-medium text-copy">
                The save couldn’t be confirmed.
              </p>
            </>
          )}
          <p
            className={
              needsRecovery ? "text-xs text-muted-foreground" : undefined
            }
          >
            {error}
          </p>
        </Alert>
      )}
      {needsRecovery && (
        <ActionGroup className="gap-x-4 gap-y-2">
          {onReload && (
            <Button
              type="button"
              size="sm"
              disabled={busy || saving}
              onClick={() => void retrySaving()}
            >
              Retry saving
            </Button>
          )}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="text-xs text-muted-foreground underline"
            onClick={downloadDraft}
          >
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
        </ActionGroup>
      )}
      {recovering && (
        <p role="status">
          Saving or refreshing. Keep this page open.
        </p>
      )}
      <FieldGroup disabled={busy} className="editor-content flex min-h-0 flex-col">
        {c.kind === "course" ? (
          <CourseBuilder
            course={c}
            navigation={canvasNavigation}
            introduction={<WritingTitle id="editor-title" aria-label="Title" maxLength={160} disabled={busy} value={c.title} onChange={(event) => set("title", event.target.value.replace(/\n/g, " "))} placeholder="Untitled course" />}
            details={details}
            recovery={recovery}
            requirementsCount={requirements.length}
            revealDetails={detailsReveal}
            incompleteSteps={[
              ...new Set(
                requirements.flatMap((item) =>
                    item.step ? [item.step] : [],
                  ),
                ),
              ]}
              revealStep={revealStep}
              onChange={(updater) => setC(updater)}
              onUpload={upload}
              disabled={busy}
            />
          ) : (
            <EditorFrame
              navigation={canvasNavigation}
              details={details}
              recovery={recovery}
              download={{ value: c.body, name: c.title }}
              requirementsCount={requirements.length}
              revealDetails={detailsReveal}
              disabled={busy}
            >
              <WritingEditor
                canvas
                downloadName={c.title}
                label={c.kind === "doc" ? "Doc content" : "Update content"}
                title={
                    <WritingTitle
                      id="editor-title"
                      disabled={busy}
                      aria-label="Title"
                      maxLength={160}
                      value={c.title}
                      onChange={(event) =>
                        set("title", event.target.value.replace(/\n/g, " "))
                      }
                      placeholder={`Untitled ${c.kind === "doc" ? "doc" : "update"}`}
                    />
                }
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
