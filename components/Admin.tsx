"use client";
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
import { useState } from "react";
import { ActionGroup } from "./ui/action-group";
import { GroupPicker } from "./ui/group-picker";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

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
  MoreHorizontal,
} from "lucide-react";
import CourseCoverEditor from "./CourseCoverEditor";
import MarkdownEditor, { type UploadMedia } from "./MarkdownEditor";
import SiteSettingsPanel from "./SiteSettingsPanel";
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
        description: "Your organization’s name, logo, and accent color.",
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
};
const id = () => crypto.randomUUID();
export default function Admin({
  data,
  user,
  onChange,
  production = false,
  onUpload,
  onLearning,
}: Props) {
  const { confirm } = useInteractionDialog();
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
    setEditing(null);
    setNotice(production ? "Content saved." : "Content saved in this browser.");
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
      setNotice(production ? "Account saved." : "Demo profile saved.");
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
      />
    );
  if (detailScope?.groupId)
    return (
      <>
        <button
          className="text-button"
          onClick={() => {
            setDetailScope(null);
            setTab("groups");
          }}
        >
          ← Administration
        </button>
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
        <button
          className="text-button"
          onClick={() => {
            setTab("people");
            setDetailScope(null);
          }}
        >
          <ArrowLeft size={16} /> Back to people
        </button>
        <div className="page-heading">
          <h1>{person?.name}</h1>
          <p>{person?.email}</p>
        </div>
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

  return (
    <>
      <div className="page-heading admin-page-heading">
        <span className="eyebrow">ORGANIZATION</span>
        <h1>Administration</h1>
        <p>
          Content, people, and the settings that keep your organization running.
        </p>
      </div>
      <Tabs
        className="admin-layout"
        orientation="vertical"
        value={tab}
        onValueChange={async (next) => {
          if (
            settingsPending &&
            !(await confirm(
              "Leave this page? Unsaved changes will be discarded.",
            ))
          )
            return;
          setSettingsPending(false);
          setTab(next);
          setNotice("");
          setQuery("");
        }}
      >
        <TabsList className="admin-sidebar" aria-label="Administration">
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
        </TabsList>
        <TabsContent value={tab} className="admin-panel" key={tab}>
          <div className="admin-panel-heading">
            <h2>
              {
                adminSections.flatMap((s) => s.items).find((s) => s.id === tab)
                  ?.name
              }
            </h2>
            <p>
              {
                adminSections.flatMap((s) => s.items).find((s) => s.id === tab)
                  ?.description
              }
            </p>
          </div>
          {notice && (
            <div className="success" role="status">
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
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
            <TeamsAdmin data={data} onChange={onChange} />
          ) : tab === "content" ? (
            <>
              <div className="admin-toolbar">
                <div className="topic-tabs">
                  {["all", "doc", "brief", "course"].map((t) => (
                    <button
                      className={filter === t ? "selected" : ""}
                      onClick={() => {
                        setFilter(t);
                        setCategory("all");
                      }}
                      key={t}
                    >
                      {
                        {
                          all: "All content",
                          doc: "Docs",
                          brief: "Updates",
                          course: "Courses",
                        }[t]
                      }
                    </button>
                  ))}
                </div>
                <div className="button-group">
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
                </div>
              </div>
              <div className="filter-bar">
                <label>
                  Search content
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Title, summary, or folder"
                  />
                </label>
                <label>
                  Channel / category
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
                </label>
                <label>
                  Sort content
                  <SelectField
                    value={sort}
                    onValueChange={(value) => setSort(value)}
                  >
                    <option value="title">Title A–Z</option>
                    <option value="updated">Recently updated</option>
                    <option value="oldest">Oldest update first</option>
                  </SelectField>
                </label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Content</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Version</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
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
                        <tr key={c.id}>
                          <td>
                            <strong>{c.title}</strong>
                            <small>
                              {c.category}
                              {c.folder ? " / " + c.folder : ""}
                            </small>
                          </td>
                          <td>
                            {c.kind === "doc"
                              ? "Doc"
                              : c.kind === "brief"
                                ? "Update"
                                : "Course"}
                          </td>
                          <td>
                            <span className={"status " + c.status}>
                              {production && c.publishedRevision
                                ? c.publishedRevision === c.revision
                                  ? "published"
                                  : "published · draft changes"
                                : c.status}
                            </span>
                          </td>
                          <td>v{c.version}</td>
                          <td>
                            <ActionGroup>
                              <button
                                className="text-button"
                                onClick={() => setEditing(structuredClone(c))}
                              >
                                Edit
                              </button>

                              {production && c.publishedRevision && (
                                <button
                                  className="text-button"
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
                                      setNotice("Content unpublished.");
                                    } catch (e) {
                                      setNotice((e as Error).message);
                                    }
                                  }}
                                >
                                  Unpublish
                                </button>
                              )}
                            </ActionGroup>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : tab === "people" ? (
            <>
              <section className="editor-block">
                <h2>New users</h2>
                <label>
                  Default onboarding stage for new users
                  <SelectField
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
                        setNotice(
                          "Default saved. Existing people are unchanged.",
                        );
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
                </label>
                <p className="muted">
                  Applies to newly added users and new self-registrations. You
                  can override the stage and start date for each person. Group
                  membership still determines assigned courses.
                </p>
              </section>
              {production && <PendingPeople data={data} onChange={onChange} />}
              <div className="admin-toolbar">
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
              </div>
              <div className="filter-bar">
                <label>
                  Search profiles
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Name or email"
                  />
                </label>
                <label>
                  Role
                  <SelectField
                    value={peopleRole}
                    onValueChange={(value) => setPeopleRole(value)}
                  >
                    <option value="all">All roles</option>
                    <option value="learner">Learner</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </SelectField>
                </label>
                <label>
                  Group
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
                </label>
                <label>
                  Profile status
                  <SelectField
                    value={peopleStatus}
                    onValueChange={(value) => setPeopleStatus(value)}
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </SelectField>
                </label>
                <label>
                  Sort profiles
                  <SelectField
                    value={sort}
                    onValueChange={(value) => setSort(value)}
                  >
                    <option value="title">Name A–Z</option>
                    <option value="reverse">Name Z–A</option>
                  </SelectField>
                </label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Access</th>
                      <th>Groups</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
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
                        <tr key={u.id}>
                          <td>
                            <strong>{u.name}</strong>
                            <small>{u.email}</small>
                          </td>
                          <td>{u.role}</td>
                          <td>
                            {data.groups
                              .filter((g) =>
                                effectiveGroups(u, data.groups).has(g.id),
                              )
                              .map((g) => g.name)
                              .join(", ") || "No groups"}
                          </td>
                          <td>{u.active ? "Active" : "Inactive"}</td>
                          <td>
                            <ActionGroup>
                              <button
                                className="text-button"
                                onClick={() => setPerson(structuredClone(u))}
                              >
                                Edit
                              </button>
                              <button
                                className="text-button"
                                onClick={() => setDetailScope({ userId: u.id })}
                              >
                                Courses & progress
                              </button>
                            </ActionGroup>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
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
              <button
                type="button"
                className="modal-close icon-button"
                aria-label="Close profile editor"
                onClick={() => setPerson(null)}
              >
                <X />
              </button>
              <DialogTitle className="ui-dialog-title">
                {production ? "Account" : "Demo profile"}
              </DialogTitle>
              <DialogDescription className="ui-dialog-description">
                {production
                  ? "Changes apply to this verified account. Login email is read-only."
                  : "Use fictional details. This does not create a secure account."}
              </DialogDescription>
              <label>
                Name
                <input
                  required
                  maxLength={80}
                  value={person.name}
                  onChange={(e) =>
                    setPerson({ ...person, name: e.target.value })
                  }
                />
              </label>
              <label>
                {production ? "Login email" : "Email label"}
                <input
                  type="email"
                  required
                  disabled={production}
                  value={person.email}
                  onChange={(e) =>
                    setPerson({ ...person, email: e.target.value })
                  }
                />
              </label>
              <OnboardingFields
                value={person.onboardingStart}
                onChange={(onboardingStart) =>
                  setPerson({ ...person, onboardingStart })
                }
              />
              <label>
                Access
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
              </label>
              <label>
                Reporting team
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
              </label>
              <GroupPicker
                groups={data.groups}
                value={person.groups}
                onChange={(groups) => setPerson({ ...person, groups })}
              />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  disabled={person.id === user.id}
                  checked={person.active}
                  onChange={(e) =>
                    setPerson({ ...person, active: e.target.checked })
                  }
                />
                Active profile
              </label>
              <Button variant="default">
                <Save size={16} />
                Save profile
              </Button>
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
}: {
  onUpload?: UploadMedia;
  production?: boolean;
  content: Content;
  data: Workspace;
  onSave: (c: Content) => void | Promise<void>;
  onCancel: () => void;
  onLearning?: LearningHandler;
  onWorkspaceChange?: (data: Workspace) => void | Promise<void>;
}) {
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
    [coverUploading, setCoverUploading] = useState(false),
    [creatingSection, setCreatingSection] = useState(false),
    [sectionSaving, setSectionSaving] = useState(false);
  const docSections = availableDocSections(
    [
      ...data.content.filter((item) => item.kind === "doc"),
      ...(c.kind === "doc" ? [c] : []),
    ],
    data.settings?.docCategoryOrder,
  );
  const existing = data.content.some((x) => x.id === c.id);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (coverUploading || sectionSaving) return;
    if (
      c.kind === "course" &&
      c.status === "published" &&
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
        return JSON.stringify(body);
      };
      if (latest && editable(latest) !== editable(content))
        throw new Error(
          "This content changed while you were editing. Reopen it before saving so those changes are preserved.",
        );
      await onSave({
        ...c,
        ...(latest
          ? {
              assignments: latest.assignments,
              groups: c.kind === "course" ? latest.groups : c.groups,
              revision: latest.revision,
            }
          : {}),
        title: c.title.trim(),
        category: c.category.trim(),
        version: existing && refresh ? content.version + 1 : content.version,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const set = (key: string, value: unknown) =>
    setC((prev) => ({ ...prev, [key]: value }));
  if (editorTab === "assignments" && onLearning)
    return (
      <>
        <button className="text-button" onClick={() => setEditorTab("content")}>
          <ArrowLeft size={16} />
          Back to course builder
        </button>
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
    <form className="editor" onSubmit={submit}>
      <button type="button" className="text-button" onClick={onCancel}>
        <ArrowLeft size={16} />
        Back to content
      </button>
      <div className="editor-heading">
        <div>
          <span className="eyebrow">
            {existing ? "EDIT" : "CREATE"}{" "}
            {c.kind === "doc"
              ? "ARTICLE"
              : c.kind === "brief"
                ? "BRIEF"
                : "COURSE"}
          </span>
          <h1>{existing ? c.title : "Something worth sharing."}</h1>
        </div>
        <Button
          variant="default"
          disabled={saving || coverUploading || sectionSaving}
        >
          <Save size={16} />
          Save {c.status === "published" ? "& publish" : "draft"}
        </Button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="editor-layout">
        <section className="editor-main">
          <label>
            Title
            <input
              required
              maxLength={160}
              value={c.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Give it a clear, useful title"
            />
          </label>
          <label>
            Short description
            <textarea
              required
              rows={2}
              maxLength={300}
              value={c.summary}
              onChange={(e) => set("summary", e.target.value)}
              placeholder="What will people find here?"
            />
          </label>
          {c.kind !== "course" ? (
            <MarkdownEditor
              label="Doc content"
              value={c.body}
              onChange={(value) => set("body", value)}
              onUpload={onUpload}
            />
          ) : (
            <>
              <div className="section-heading">
                <h2>Lessons</h2>
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
              </div>
              {c.lessons.map((l, i) => (
                <section className="editor-block" key={l.id}>
                  <div className="editor-block-heading">
                    <strong>Lesson {i + 1}</strong>
                    <div>
                      <button
                        type="button"
                        className="text-button"
                        disabled={i === 0}
                        onClick={() => {
                          const next = [...c.lessons];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          set("lessons", next);
                        }}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove lesson ${i + 1}`}
                        onClick={() =>
                          set(
                            "lessons",
                            c.lessons.filter((x) => x.id !== l.id),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <label>
                    Lesson title
                    <input
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
                  </label>
                  <MarkdownEditor
                    label={`Lesson ${i + 1} text`}
                    rows={8}
                    value={l.body}
                    onUpload={onUpload}
                    onChange={(value) =>
                      set(
                        "lessons",
                        c.lessons.map((x) =>
                          x.id === l.id ? { ...x, body: value } : x,
                        ),
                      )
                    }
                  />
                  {onUpload && (
                    <label>
                      Upload lesson video{" "}
                      <small>MP4 or WebM, up to 50 MB.</small>
                      <input
                        type="file"
                        accept="video/mp4,video/webm"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setSaving(true);
                          try {
                            const url = await onUpload(f);
                            setC((prev) => ({
                              ...prev,
                              lessons: prev.lessons.map((x) =>
                                x.id === l.id ? { ...x, videoUrl: url } : x,
                              ),
                            }));
                          } catch (error) {
                            setError((error as Error).message);
                          } finally {
                            setSaving(false);
                          }
                        }}
                      />
                    </label>
                  )}
                  <label>
                    Video URL{" "}
                    <small>
                      Optional. YouTube, Vimeo, or a direct HTTPS MP4/WebM URL.
                    </small>
                    <input
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
                  </label>
                </section>
              ))}
              <div className="section-heading">
                <h2>Quiz</h2>
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
              </div>
              <p className="muted">
                Learners must answer every question correctly. Unlimited
                retries.
              </p>
              {c.questions.map((q, i) => (
                <section className="editor-block" key={q.id}>
                  <div className="editor-block-heading">
                    <strong>Question {i + 1}</strong>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove question ${i + 1}`}
                      onClick={() =>
                        set(
                          "questions",
                          c.questions.filter((x) => x.id !== q.id),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <label>
                    Question
                    <input
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
                  </label>
                  {q.options.map((o, j) => (
                    <div className="answer-row" key={j}>
                      <input
                        type="radio"
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
                      <input
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
                </section>
              ))}
            </>
          )}
        </section>
        <aside className="editor-settings">
          <section className="editor-setting-section">
            <h3>Publishing</h3>
            {production && (
              <p className="muted">
                Saving a draft keeps the current public version online. Select
                Published to replace it. Unpublish from the content list to
                remove public access.
              </p>
            )}
            <label>
              Status
              <SelectField
                value={c.status}
                onValueChange={(value) => set("status", value)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </SelectField>
            </label>
          </section>
          <section className="editor-setting-section">
            <h3>Organization</h3>
            {c.kind === "doc" ? (
              <>
                <label>
                  Section
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
                </label>
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
              <label>
                {c.kind === "course" ? "Channel" : "Category"}
                <input
                  required
                  list="categories"
                  value={c.category}
                  onChange={(e) => set("category", e.target.value)}
                />
                <datalist id="categories">
                  {Array.from(
                    new Set(
                      data.content
                        .filter((x) => x.kind === c.kind)
                        .map((x) => x.category),
                    ),
                  ).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </datalist>
              </label>
            )}
          </section>
          {c.kind === "brief" && (
            <section className="editor-setting-section">
              <h3>For you</h3>
              <p>
                Choose the learning groups this update is relevant to. Everyone
                can still read it.
              </p>
              <GroupPicker
                groups={data.groups}
                value={c.groups}
                onChange={(groups) => set("groups", groups)}
              />
            </section>
          )}
          {c.kind === "course" && (
            <>
              <section className="editor-setting-section">
                <h3>Course details</h3>
                <CourseCoverEditor
                  url={c.coverImageUrl}
                  onUpload={onUpload}
                  disabled={saving || coverUploading || sectionSaving}
                  onBusyChange={setCoverUploading}
                  onChange={(url) =>
                    setC((current) => ({ ...current, coverImageUrl: url }))
                  }
                />
                <label>
                  Estimated minutes
                  <input
                    type="number"
                    min={1}
                    max={600}
                    required
                    value={c.duration}
                    onChange={(e) => set("duration", Number(e.target.value))}
                  />
                </label>
              </section>
              <section className="editor-setting-section">
                <h3>Assigned courses</h3>
                <p className="muted">
                  Manage this course through Learning groups. Course completion
                  windows are managed in organization settings.
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
                    Publish this course to add it to a group’s assigned courses.
                  </p>
                )}
              </section>
              {existing && (
                <section className="editor-setting-section">
                  <h3>Course version</h3>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={refresh}
                      onChange={(e) => setRefresh(e.target.checked)}
                    />
                    Publish a new version and start a new completion window
                  </label>
                  <small>
                    Current version: {content.version}. Keep this unchecked for
                    minor corrections.
                  </small>
                </section>
              )}
            </>
          )}
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
        </aside>
      </div>
    </form>
  );
}
