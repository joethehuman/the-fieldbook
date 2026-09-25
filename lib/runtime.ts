import type { Workspace } from "./store";
import type { Content, User, Progress } from "./types";
import type { UploadMedia } from "@/components/MarkdownEditor";
export type FieldbookRuntime = {
  search: import("./search").SearchProvider;
  manageLearning: (
    action: import("./learning").LearningAction,
  ) => Promise<Workspace>;
  load: () => Promise<{ data: Workspace; user: User | null }>;
  refresh?: () => Promise<Workspace>;
  save: (before: Workspace, after: Workspace) => Promise<Workspace>;
  progress: (
    course: Content,
    current: Progress[],
    lessonId?: string,
    answers?: number[],
  ) => Promise<{ progress: Progress[]; attemptPassed?: boolean }>;
  upload: UploadMedia;
  signIn: () => void;
  signOut: () => Promise<void>;
  admin?: {
    prefetch: () => void;
    prepare: (
      scope: "content" | "governance" | "feedback",
    ) => Promise<Workspace>;
    edit: (id: string) => Promise<{ data: Workspace; item: Content }>;
    unpublish: (id: string) => Promise<Workspace>;
  };
};
