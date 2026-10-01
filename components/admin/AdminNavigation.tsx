"use client";
import { ResponsiveTabsNavigation } from "../patterns/responsive-tabs-navigation";
import { TabsTrigger } from "../ui/tabs";
import {
  FileText,
  MessageSquare,
  Users,
  Layers,
  BarChart3,
  Settings,
  Trash2,
} from "lucide-react";
export const adminSections = [
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

export function AdminNavigation({
  tab,
  production = false,
  disabled = false,
  onValueChange,
}: {
  tab: string;
  production?: boolean;
  disabled?: boolean;
  onValueChange: (next: string) => void | Promise<void>;
}) {
  return (
    <div className="contents" inert={disabled || undefined}>
      <ResponsiveTabsNavigation
        label="Administration section"
        value={tab}
        onValueChange={onValueChange}
        options={adminSections
          .flatMap((section) => section.items)
          .map((item) => ({
            id: item.id,
            name:
              item.id === "people" && !production ? "Demo profiles" : item.name,
          }))}
      >
        {adminSections.map((section) => (
          <div className="admin-nav-group" key={section.label}>
            <span className="admin-nav-label">{section.label}</span>
            {section.items.map((item) => (
              <TabsTrigger
                disabled={disabled}
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
    </div>
  );
}
