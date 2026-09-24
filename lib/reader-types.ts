import type { DocLink, DocSection } from "./docs-navigation";
export type ReaderShellContext = {
  user: {
    id: string;
    name: string;
    role: "admin" | "manager" | "learner";
  } | null;
  branding: {
    name: string;
    logoUrl: string;
    accent: string;
    tagline: string;
    privacyUrl: string | null;
  };
  docs: DocLink[];
  docCategoryOrder: string[];
  docSections: DocSection[];
  updateTitles?: { id: string; title: string }[];
};
