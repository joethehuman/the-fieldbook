import type { Workspace } from "./store";
export type ReadingState = {
  data: Workspace;
  section: "learn" | "docs" | "briefs";
  id: string;
  documents?: import("./docs-navigation").DocLink[];
  lesson?: string;
  curriculum?: string;
};
