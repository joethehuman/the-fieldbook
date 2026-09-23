"use client";
import { CreatableCombobox } from "./ui/creatable-combobox";
import { WritingEditor } from "./patterns/writing-editor";
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
import DocSectionCreate from "./DocSectionCreate";
import { availableDocSections } from "@/lib/docs-navigation";
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
import CourseCoverEditor from "./CourseCoverEditor";
import MarkdownEditor, { type UploadMedia } from "./MarkdownEditor";
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
        id: "settings-identity",
        name: "Identity",
        description:
          "Installation name, logo, welcome description and privacy link.",
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
        name: "Assignment window",
        description:
          "Set completion windows for onboarding and ongoing courses.",
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
  data: Workspace;
  user: User;
  onChange: (d: Workspace) => void | Promise<void>;
  production?: boolean;
  onLearning?: LearningHandler;
  onUpload?: UploadMedia;
  registerNavigationGuard?: RegisterNavigationGuard;
  onReload?: () => Promise<Workspace>;
};
const id = () => crypto.randomUUID();
export default function Admin({
  data,
  user,
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
  const teamGuard = useRef<NavigationGuard | null>(null);
  const registerTeamGuard = useCallback<RegisterNavigationGuard>(
    (guard) => {
      teamGuard.current = guard;
      registerNavigationGuard?.(guard);
    },
    [registerNavigationGuard],
  );
  const [settingsPending, setSettingsPending] = useState(false);
  const [tab, setTab] = useState("content"),
    [editing, setEditing] = useState<Content | null>(null),
    [person, setPerson] = useState<User | null>(null),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [sort, setSort] = useState("title"),
    [peopleRole, setPeopleRole] = useState("all"),
    [peopleGroup, setPeopleGroup] = useState("all"),
    [peopleStatus, setPeopleStatus] = useState("all"),
    [detailScope, setDetailScope] = useState<{
      groupId?: string;
      userId?: string;
    } | null>(null);
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
  function create(kind: Content["kind"]) {
    setEditing({
      id: id(),
      kind,
      title: "",
      summary: "",
      body: "",
      category: kind === "course" ? "New channel" : "General",
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
    return updated;
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
    if (teamGuard.current && !(await teamGuard.current())) return;
    if (
      settingsPending &&
      !(await confirm("Leave this page? Unsaved changes will be discarded."))
    )
      return;
    setSettingsPending(false);
    setTab(next);
    adminPanel.reveal(false);
    setNotice("");
    setQuery("");
  }
  return (
    <>
      <PageHeader>
        <span className="eyebrow">ORGANIZATION</span>
        <h1>Administration</h1>
        <p>
          Content, people, and the settings that keep your organization running.
        </p>
      </PageHeader>
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
          {tab.startsWith("settings-") ? (
            <SiteSettingsPanel
              section={
                tab.slice(9) as import("./SiteSettingsPanel").SettingsSection
              }
              onPendingChange={setSettingsPending}
              data={data}
              onChange={onChange}
              onUpload={onUpload}
              production={production}
            />
          ) : tab === "feedback" ? (
            <FeedbackAdmin data={data} />
          ) : tab === "teams" ? (
            <TeamsAdmin
              data={data}
              onChange={onChange}
              registerNavigationGuard={registerTeamGuard}
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
                <FormField label="Channel / category">
                  <SelectField
                    value={category}
                    onValueChange={(value) => setCategory(value)}
                  >
                    <option value="all">All channels / categories</option>
                    {[
                      ...new Set(
                        data.content
                          .filter((c) => filter === "all" || c.kind === filter)
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
              <TableContainer>
                <DataTable layout="content">
                  <TableHeader>
                    <TableRow>
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
                    {data.content
                      .filter(
                        (c) =>
                          (filter === "all" || c.kind === filter) &&
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
                      )
                      .map((c) => (
                        <TableRow key={c.id}>
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
                                data.publishedContent?.find(
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
                                onClick={() => setEditing(structuredClone(c))}
                              >
                                Edit
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
              <TableContainer>
                <DataTable layout="people">
                  <TableHeader>
                    <TableRow>
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
                    {data.users
                      .filter(
                        (u) =>
                          `${u.name} ${u.email}`
                            .toLowerCase()
                            .includes(query.toLowerCase()) &&
                          (peopleRole === "all" || u.role === peopleRole) &&
                          (peopleGroup === "all" ||
                            effectiveGroups(u, data.groups).has(peopleGroup)) &&
                          (peopleStatus === "all" ||
                            u.active === (peopleStatus === "active")),
                      )
                      .sort((a, b) =>
                        sort === "reverse"
                          ? b.name.localeCompare(a.name)
                          : a.name.localeCompare(b.name),
                      )
                      .map((u) => (
                        <TableRow key={u.id}>
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
            </>
          ) : tab === "curricula" ? (
            <Curricula
              data={data}
              onChange={onChange}
              onEditingChange={setSettingsPending}
            />
          ) : tab === "groups" ? (
            <LearningGroups
              data={data}
              onChange={onChange}
              onLearning={manageLearning}
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
    </>
  );
}
export function Editor({
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
  onWorkspaceChange?: (data: Workspace) => void | Promise<void>;
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
    [uploadCount, setUploadCount] = useState(0),
    [creatingSection, setCreatingSection] = useState(false),
    [sectionSaving, setSectionSaving] = useState(false);
  const { confirm } = useInteractionDialog();
  const baseline = useRef(c);
  const original = useRef(content);
  const pendingUploads = useRef(0);
  const savingNow = useRef(false);
  const [recovering, setRecovering] = useState(false);
  const busy = saving || uploadCount > 0 || sectionSaving || recovering;
  const dirty =
    JSON.stringify(c) !== JSON.stringify(baseline.current) || refresh;
  const guard = useRef(async () => true);
  guard.current = async () => {
    if (
      pendingUploads.current ||
      savingNow.current ||
      sectionSaving ||
      recovering
    ) {
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
  const docSections = availableDocSections(
    [
      ...data.content.filter((item) => item.kind === "doc"),
      ...(c.kind === "doc" ? [c] : []),
    ],
    data.settings?.docCategoryOrder,
  );
  const existing = data.content.some((x) => x.id === c.id);
  async function submit(e: React.FormEvent, intent?: "draft" | "published") {
    e.preventDefault();
    const saveStatus = intent || (c.kind === "course" ? c.status : "draft");
    if (busy || pendingUploads.current || savingNow.current) return;
    if (
      c.kind === "course" &&
      saveStatus === "published" &&
      (!c.lessons.length ||
        c.lessons.some(
          (l) => !l.title.trim() || (!l.body.trim() && !l.videoUrl),
        ) ||
        c.questions.some(
          (q) =>
            !q.prompt.trim() ||
            q.options.some((o) => !o.trim()) ||
            q.answer === undefined,
        ))
    ) {
      setError(
        "Published courses need at least one complete lesson and valid quiz questions with correct answers.",
      );
      return;
    }
    if (c.lessons.some((l) => l.videoUrl && !videoSource(l.videoUrl))) {
      setError("Use a supported HTTPS YouTube, Vimeo, MP4, or WebM URL.");
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
      <FieldGroup disabled={busy} className="editor-layout">
        <section className="editor-main">
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
          {c.kind !== "course" ? (
            <WritingEditor
              label={c.kind === "doc" ? "Doc content" : "Update content"}
              value={c.body}
              onChange={(value) => set("body", value)}
              onUpload={upload}
              disabled={busy}
            />
          ) : (
            <>
              <SectionHeader title={<h2>Lessons</h2>}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    set("lessons", [
                      ...c.lessons,
                      { id: id(), title: "", body: "" },
                    ])
                  }
                >
                  <Plus size={16} />
                  Add lesson
                </Button>
              </SectionHeader>
              {c.lessons.map((l, i) => (
                <Card className="grid gap-4" key={l.id}>
                  <SectionHeader title={<strong>Lesson {i + 1}</strong>}>
                    <div>
                      <Button
                        variant="link"
                        type="button"

                        disabled={i === 0}
                        onClick={() => {
                          const next = [...c.lessons];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          set("lessons", next);
                        }}
                      >
                        Move up
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"

                        aria-label={`Remove lesson ${i + 1}`}
                        onClick={() =>
                          set(
                            "lessons",
                            c.lessons.filter((x) => x.id !== l.id),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </SectionHeader>
                  <FormField label="Lesson title">
                    <Input
                      required
                      value={l.title}
                      onChange={(e) =>
                        set(
                          "lessons",
                          c.lessons.map((x) =>
                            x.id === l.id ? { ...x, title: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </FormField>
                  <MarkdownEditor
                    label={`Lesson ${i + 1} text`}
                    rows={8}
                    value={l.body}
                    onUpload={upload}
                    onChange={(value) =>
                      setC((current) => ({
                        ...current,
                        lessons: current.lessons.map((x) =>
                          x.id === l.id ? { ...x, body: value } : x,
                        ),
                      }))
                    }
                  />
                  {onUpload && (
                    <FormField
                      label="Upload lesson video"
                      description="MP4 or WebM, up to 50 MB."
                    >
                      <Input
                        type="file"
                        accept="video/mp4,video/webm"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          e.target.value = "";
                          setError("");
                          try {
                            const url = await upload!(f);
                            setC((prev) => ({
                              ...prev,
                              lessons: prev.lessons.map((x) =>
                                x.id === l.id ? { ...x, videoUrl: url } : x,
                              ),
                            }));
                          } catch (error) {
                            setError((error as Error).message);
                          }
                        }}
                      />
                    </FormField>
                  )}
                  <FormField
                    label="Video URL"
                    description="Optional. YouTube, Vimeo, or a direct HTTPS MP4/WebM URL."
                  >
                    <Input
                      type="text"
                      placeholder="Upload a file or paste a supported video URL"
                      value={l.videoUrl || ""}
                      onChange={(e) =>
                        set(
                          "lessons",
                          c.lessons.map((x) =>
                            x.id === l.id
                              ? { ...x, videoUrl: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </FormField>
                </Card>
              ))}
              <SectionHeader title={<h2>Quiz</h2>}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    set("questions", [
                      ...c.questions,
                      {
                        id: id(),
                        prompt: "",
                        options: ["", "", ""],
                        answer: 0,
                      },
                    ])
                  }
                >
                  <Plus size={16} />
                  Add question
                </Button>
              </SectionHeader>
              <p className="muted">
                Learners must answer every question correctly. Unlimited
                retries.
              </p>
              {c.questions.map((q, i) => (
                <Card className="grid gap-4" key={q.id}>
                  <SectionHeader title={<strong>Question {i + 1}</strong>}>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"

                      aria-label={`Remove question ${i + 1}`}
                      onClick={() =>
                        set(
                          "questions",
                          c.questions.filter((x) => x.id !== q.id),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </Button>
                  </SectionHeader>
                  <FormField label="Question">
                    <Input
                      required
                      value={q.prompt}
                      onChange={(e) =>
                        set(
                          "questions",
                          c.questions.map((x) =>
                            x.id === q.id
                              ? { ...x, prompt: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </FormField>
                  {q.options.map((o, j) => (
                    <div className="answer-row" key={j}>
                      <Radio
                        aria-label={`Correct answer ${j + 1} for question ${i + 1}`}
                        name={"correct-" + q.id}
                        checked={q.answer === j}
                        onChange={() =>
                          set(
                            "questions",
                            c.questions.map((x) =>
                              x.id === q.id ? { ...x, answer: j } : x,
                            ),
                          )
                        }
                      />
                      <Input
                        aria-label={`Answer ${j + 1} for question ${i + 1}`}
                        required
                        value={o}
                        onChange={(e) =>
                          set(
                            "questions",
                            c.questions.map((x) =>
                              x.id === q.id
                                ? {
                                    ...x,
                                    options: x.options.map((a, k) =>
                                      k === j ? e.target.value : a,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                      {q.answer === j && <Check size={16} />}
                    </div>
                  ))}
                  <small>Select the circle next to the correct answer.</small>
                </Card>
              ))}
            </>
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
                      data.publishedContent?.find((live) => live.id === c.id),
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
                    <FormField label="Section">
                      <SelectField
                        aria-label="Section"
                        value={`section:${c.category}`}
                        disabled={saving || sectionSaving}
                        onValueChange={(value) => {
                          if (value === "create") setCreatingSection(true);
                          else {
                            set("category", value.slice(8));
                            setCreatingSection(false);
                          }
                        }}
                      >
                        {docSections.map((name) => (
                          <option key={name} value={`section:${name}`}>
                            {name}
                          </option>
                        ))}
                        {onWorkspaceChange && (
                          <option value="create">Create new section…</option>
                        )}
                      </SelectField>
                    </FormField>
                    {creatingSection && onWorkspaceChange && (
                      <DocSectionCreate
                        sections={docSections}
                        disabled={saving}
                        onBusyChange={setSectionSaving}
                        onCancel={() => setCreatingSection(false)}
                        onCreate={async (name) => {
                          await onWorkspaceChange({
                            ...data,
                            settings: {
                              ...defaultSettings,
                              ...data.settings,
                              docCategoryOrder: [...docSections, name],
                            },
                          });
                          set("category", name);
                          setCreatingSection(false);
                        }}
                      />
                    )}
                  </>
                ) : (
                  <FormField
                    label={c.kind === "course" ? "Channel" : "Category"}
                  >
                    <CreatableCombobox
                      required
                      value={c.category}
                      onValueChange={(value) => set("category", value)}
                      options={data.content
                        .filter((item) => item.kind === c.kind)
                        .map((item) => item.category)}
                      listLabel={
                        c.kind === "course" ? "Channels" : "Categories"
                      }
                      placeholder="Choose or add a name…"
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
              {c.kind === "course" && (
                <>
                  <section className="editor-setting-section">
                    <h3>Course details</h3>
                    <CourseCoverEditor
                      url={c.coverImageUrl}
                      onUpload={upload}
                      disabled={busy}
                      onChange={(url) =>
                        setC((current) => ({ ...current, coverImageUrl: url }))
                      }
                    />
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
