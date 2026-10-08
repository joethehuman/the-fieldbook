import { recordId, recordSegment } from "./record-url";
import type { Workspace } from "./store";
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
  contentKind?: Content["kind"];
  deletedKind?: "content" | "user";
  id?: string;
  view?: "edit";
  panel?: "members" | "subteams" | "people" | "learning" | "updates";
  create?: Content["kind"] | "person" | "curriculum";
};
const contentKinds = {
  docs: "doc",
  updates: "brief",
  courses: "course",
} as const;
const kindPaths = { doc: "docs", brief: "updates", course: "courses" } as const;
type AdminRecords = Pick<
  Workspace,
  "content" | "users" | "teams" | "groups" | "curricula" | "progressReport"
>;
export function adminRecords(
  destination: AdminDestination,
  data: AdminRecords,
) {
  return destination.tab === "content"
    ? data.content
    : destination.tab === "people"
      ? data.users
      : destination.tab === "teams"
        ? data.teams
        : destination.tab === "groups"
          ? data.groups
          : destination.tab === "progress"
            ? data.progressReport?.people.map((person) => person.u) ||
              data.users
            : data.curricula;
}
export function resolveAdminDestination(
  destination: AdminDestination,
  data: AdminRecords,
): AdminDestination {
  if (!destination.id) return destination;
  return {
    ...destination,
    id:
      recordId(destination.id, adminRecords(destination, data)) ||
      destination.id,
  };
}
export function adminRecordName(
  destination: AdminDestination,
  data: AdminRecords,
): string | undefined {
  const record = adminRecords(destination, data)?.find(
    (item) => item.id === destination.id,
  );
  return record && ("title" in record ? record.title : record.name);
}
export function adminHref(
  destination: AdminDestination,
  name?: string,
): string {
  const base = `/admin/${adminPaths[destination.tab]}`;
  const segment = destination.id ? recordSegment(destination.id, name) : "";
  let path =
    destination.tab === "progress" && destination.id
      ? `${base}/people/${segment}`
      : destination.create
        ? `${base}/new/${destination.create}`
        : destination.id
          ? `${base}/${segment}${destination.view === "edit" ? "/edit" : destination.panel ? `/${destination.panel}` : ""}`
          : destination.tab === "content" && destination.contentKind
            ? `${base}/${kindPaths[destination.contentKind]}`
            : destination.tab === "deleted" && destination.deletedKind
              ? `${base}/${destination.deletedKind === "user" ? "users" : "content"}`
              : base;
  if (
    destination.tab === "content" &&
    (destination.id || destination.create) &&
    destination.contentKind
  )
    path += `?from=${kindPaths[destination.contentKind]}`;
  return path;
}
export function parseAdminDestination(
  path: string,
  data?: AdminRecords,
): AdminDestination | null {
  const query = new URLSearchParams(path.split("?")[1]);
  const from = query.get("from");
  const contentKind =
    from && Object.hasOwn(contentKinds, from)
      ? contentKinds[from as keyof typeof contentKinds]
      : undefined;
  const parsed = parseAdminPath(path.split("?")[0], data);
  if (!parsed) return null;
  const destination =
    parsed.tab === "content" && contentKind
      ? { ...parsed, contentKind }
      : parsed;
  return data ? resolveAdminDestination(destination, data) : destination;
}
function parseAdminPath(
  path: string,
  data?: AdminRecords,
): AdminDestination | null {
  if (path === "/admin" || path === "/admin/") return { tab: "content" };
  for (const [tab, segment] of Object.entries(adminPaths)) {
    const base = `/admin/${segment}`;
    if (path === base) return { tab: tab as AdminTab };
    if (!path.startsWith(base + "/")) continue;
    const rest = path.slice(base.length + 1).split("/");
    if (
      tab === "content" &&
      rest.length === 1 &&
      Object.hasOwn(contentKinds, rest[0])
    )
      return {
        tab: "content",
        contentKind: contentKinds[rest[0] as keyof typeof contentKinds],
      };
    if (
      tab === "deleted" &&
      rest.length === 1 &&
      ["content", "users"].includes(rest[0])
    )
      return {
        tab: "deleted",
        deletedKind: rest[0] === "users" ? "user" : "content",
      };
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
        const id = recordId(
          decodeURIComponent(rest[1]),
          data ? adminRecords({ tab: "progress" }, data) : undefined,
        );
        return id && !id.includes("/") && id.length <= 200
          ? { tab: "progress", id }
          : null;
      } catch {
        return null;
      }
    }
    let id: string;
    try {
      const token = decodeURIComponent(rest[0]);
      id =
        !data && ["teams", "groups", "curricula"].includes(tab)
          ? token
          : recordId(
              token,
              data ? adminRecords({ tab: tab as AdminTab }, data) : undefined,
            ) || "";
    } catch {
      return null;
    }
    if (!id || id === "new" || id.includes("/") || id.length > 500) return null;
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
