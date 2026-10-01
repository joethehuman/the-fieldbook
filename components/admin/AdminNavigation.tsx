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
import { adminSections } from "@/lib/admin-navigation";
export { adminSections } from "@/lib/admin-navigation";

const icons: Record<string, typeof FileText> = {
  content: FileText,
  feedback: MessageSquare,
  people: Users,
  teams: Users,
  groups: Layers,
  curricula: Layers,
  progress: BarChart3,
  "settings-identity": Settings,
  "settings-docs": FileText,
  "settings-courses": Layers,
  "settings-access": Users,
  "settings-privacy": FileText,
  "settings-mcp": Settings,
  deleted: Trash2,
};

export function AdminNavigation({
  tab,
  production = false,
  disabled = false,
  onValueChange,
  onIntent,
}: {
  tab: string;
  production?: boolean;
  disabled?: boolean;
  onIntent?: (next: string) => void;
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
            {section.items.map((item) => {
              const Icon = icons[item.id];
              return (
                <TabsTrigger
                  onPointerEnter={() => onIntent?.(item.id)}
                  onFocus={() => onIntent?.(item.id)}
                  disabled={disabled}
                  value={item.id}
                  key={item.id}
                  className={tab === item.id ? "selected" : ""}
                >
                  <Icon size={16} />
                  {item.id === "people" && !production
                    ? "Demo profiles"
                    : item.name}
                </TabsTrigger>
              );
            })}
          </div>
        ))}
      </ResponsiveTabsNavigation>
    </div>
  );
}
