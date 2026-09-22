import type { Workspace } from "./store";
export type ReadingState = {
  data: Workspace;
  section: "learn" | "docs" | "briefs";
  id: string;
  lesson?: string;
  curriculum?: string;
};
