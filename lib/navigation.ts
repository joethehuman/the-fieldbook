import type { SiteSettings } from "./settings";
import { recordSegment } from "./record-url";

export const organizationHomePath = "/courses";

export function homePath(settings?: Pick<SiteSettings, "homePage">): string {
  switch (settings?.homePage) {
    case "updates":
      return "/updates";
    case "docs":
      return "/docs";
    default:
      return organizationHomePath;
  }
}

export const sectionPaths = {
  learn: "courses",
  docs: "docs",
  briefs: "updates",
  admin: "admin",
  team: "team",
} as const;

export function resolveSection(
  path: string,
): keyof typeof sectionPaths | undefined {
  const aliases: Record<string, keyof typeof sectionPaths> = {
    courses: "learn",
    curricula: "learn",
    docs: "docs",
    updates: "briefs",
    admin: "admin",
    team: "team",
  };
  return Object.hasOwn(aliases, path) ? aliases[path] : undefined;
}

export function contentPath(kind: "course" | "doc" | "brief", id: string, title?: string) {
  const section =
    kind === "course" ? "learn" : kind === "doc" ? "docs" : "briefs";
  return `/${sectionPaths[section]}/${recordSegment(id, title)}`;
}

export function curriculumPath(id: string, title?: string) {
  return `/curricula/${recordSegment(id, title)}`;
}
