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
    email: string;
    role: User["role"];
    managesTeam: boolean;
  } | null;
  branding: {
    homePage?: SiteSettings["homePage"];
    name: string;
    accent: string;
    privacyUrl: string | null;
    externalLinks?: SiteSettings["externalLinks"];
    askAiEnabled?: boolean;
  };
  docs: DocLink[];
  docCategoryOrder: string[];
  docSections: DocSection[];
};
