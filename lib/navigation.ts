export const sectionPaths = {
  learn: "learning",
  docs: "knowledge",
  briefs: "notes",
  admin: "admin",
  team: "team",
} as const;
export function contentPath(kind: "course" | "doc" | "brief", id: string) {
  return `/${kind === "course" ? "learning" : kind === "doc" ? "knowledge" : "notes"}/${encodeURIComponent(id)}`;
}
