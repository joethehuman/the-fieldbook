import type { Workspace } from "./store";
import type { Content, User, Progress } from "./types";
import type { UploadMedia } from "@/components/MarkdownEditor";
export type FieldbookRuntime = {
  manageLearning: (
    action: import("./learning").LearningAction,
  ) => Promise<Workspace>;
  load: () => Promise<{ data: Workspace; user: User | null }>;
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
};
