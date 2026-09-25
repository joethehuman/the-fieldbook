import type { DocLink, DocSection } from "./docs-navigation";
import type { Content, Curriculum, Group, Progress, User } from "./types";
import type { SiteSettings } from "./settings";
export type CourseReaderData = {
  user: User;
  courses: Content[];
  groups: Group[];
  curricula: Curriculum[];
  settings: SiteSettings;
  progress: Progress[];
};
export type ReaderShellContext = {
  user: {
    id: string;
    name: string;
    role: "admin" | "manager" | "learner";
  } | null;
  branding: {
    name: string;
    accent: string;
    tagline: string;
    privacyUrl: string | null;
  };
  docs: DocLink[];
  docCategoryOrder: string[];
  docSections: DocSection[];
  updateTitles?: { id: string; title: string }[];
  courseTitles?: { id: string; title: string }[];
  curriculumTitles?: { id: string; title: string }[];
};
