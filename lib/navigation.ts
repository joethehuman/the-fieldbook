// Change this one destination if the installation home moves to Updates.
export const organizationHomePath = "/courses";

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

export function contentPath(kind: "course" | "doc" | "brief", id: string) {
  const section =
    kind === "course" ? "learn" : kind === "doc" ? "docs" : "briefs";
  return `/${sectionPaths[section]}/${encodeURIComponent(id)}`;
}
