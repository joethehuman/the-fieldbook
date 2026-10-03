import type { AdminScope } from "./admin-scope";
import type { Content } from "./types";

export const adminPaths = {
  content: "content",
  feedback: "feedback",
  people: "people",
  teams: "teams",
  groups: "groups",
  curricula: "curricula",
  progress: "progress",
  "settings-identity": "settings/identity",
  "settings-links": "settings/external-links",
  "settings-docs": "settings/docs-navigation",
  "settings-courses": "settings/due-dates",
  "settings-access": "settings/access",
  "settings-privacy": "settings/privacy",
  "settings-ai": "settings/ask-ai",
  "settings-mcp": "settings/mcp",
  deleted: "settings/recently-deleted",
} as const;
export type AdminTab = keyof typeof adminPaths;
export type AdminDestination = {
  tab: AdminTab;
  id?: string;
  view?: "edit";
  panel?: "members" | "subteams" | "people" | "learning" | "updates";
  create?: Content["kind"] | "person" | "curriculum";
};
export function adminHref(destination: AdminDestination): string {
  const base = `/admin/${adminPaths[destination.tab]}`;
  if (destination.tab === "progress" && destination.id)
    return `${base}/people/${encodeURIComponent(destination.id)}`;
  if (destination.create) return `${base}/new/${destination.create}`;
  return (
    base +
    (destination.id
      ? `/${encodeURIComponent(destination.id)}${destination.view === "edit" ? "/edit" : destination.panel ? `/${destination.panel}` : ""}`
      : "")
  );
}
export function parseAdminDestination(path: string): AdminDestination | null {
  if (path === "/admin" || path === "/admin/") return { tab: "content" };
  for (const [tab, segment] of Object.entries(adminPaths)) {
    const base = `/admin/${segment}`;
    if (path === base) return { tab: tab as AdminTab };
    if (!path.startsWith(base + "/")) continue;
    const rest = path.slice(base.length + 1).split("/");
    if (rest[0] === "new" && rest.length === 2) {
      const kind = rest[1];
      if (
        (tab === "content" && ["doc", "brief", "course"].includes(kind)) ||
        (tab === "people" && kind === "person") ||
        (tab === "curricula" && kind === "curriculum")
      )
        return {
          tab: tab as AdminTab,
          create: kind as AdminDestination["create"],
        };
      return null;
    }
    if (tab === "progress" && rest.length === 2 && rest[0] === "people") {
      try {
        const id = decodeURIComponent(rest[1]);
        return id && !id.includes("/") && id.length <= 200
          ? { tab: "progress", id }
          : null;
      } catch {
        return null;
      }
    }
    let id: string;
    try {
      id = decodeURIComponent(rest[0]);
    } catch {
      return null;
    }
    if (!id || id === "new" || id.includes("/") || id.length > 200) return null;
    if (
      rest.length === 2 &&
      ((tab === "teams" && ["members", "subteams"].includes(rest[1])) ||
        (tab === "groups" &&
          ["people", "learning", "updates"].includes(rest[1])))
    )
      return {
        tab: tab as AdminTab,
        id,
        panel: rest[1] as AdminDestination["panel"],
      };
    const edit = rest.length === 2 && rest[1] === "edit";
    if (
      (["content", "curricula"].includes(tab) && edit) ||
      (tab === "people" && (edit || rest.length === 1)) ||
      (["teams", "groups"].includes(tab) && rest.length === 1)
    )
      return {
        tab: tab as AdminTab,
        id,
        ...(edit ? { view: "edit" as const } : {}),
      };
    return null;
  }
  return null;
}
export function adminScope(destination: AdminDestination): AdminScope {
  if (destination.tab === "people" && destination.id && !destination.view)
    return "person";
  if (["people", "teams", "curricula"].includes(destination.tab))
    return "people";
  if (destination.tab === "progress") return "progress";
  if (destination.tab === "deleted") return "maintenance";
  if (destination.tab === "feedback") return "feedback";
  if (destination.tab === "content" || destination.tab.startsWith("settings-"))
    return "content";
  return "governance";
}
