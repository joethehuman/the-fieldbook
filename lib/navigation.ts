export const sectionPaths = {
  learn: "courses",
  docs: "docs",
  briefs: "updates",
  admin: "admin",
  team: "team",
} as const;

// Keep bookmarks and previously shared links working after the terminology update.
export function resolveSection(
  path: string,
): keyof typeof sectionPaths | undefined {
  const aliases: Record<string, keyof typeof sectionPaths> = {
    learn: "learn",
    learning: "learn",
    courses: "learn",
    knowledge: "docs",
    docs: "docs",
    briefs: "briefs",
    notes: "briefs",
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
