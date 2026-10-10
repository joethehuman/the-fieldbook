import { defaultBrandAccent } from "./brand-theme";
import { accountMenuLinks, type ExternalLink } from "./external-links";
import { categoryKey } from "./content-categories";

export type PrivacyDocument = {
  mode: "hosted" | "external";
  operatorName: string;
  contactEmail: string;
  contactUrl?: string;
  body: string;
  url: string;
};
export type PrivacySettings = {
  draft: PrivacyDocument;
  published: PrivacyDocument | null;
  publishedAt: string | null;
};
export const emptyPrivacyDocument: PrivacyDocument = {
  mode: "hosted",
  operatorName: "",
  contactEmail: "",
  contactUrl: "",
  body: "",
  url: "",
};
export const defaultPrivacy: PrivacySettings = {
  draft: emptyPrivacyDocument,
  published: null,
  publishedAt: null,
};
export type SiteSettings = {
  askAi?: import("./ai").AskAiSettings;
  /** Availability only; internal model/guidance settings stay on the server. */
  askAiEnabled?: boolean;
  externalLinks?: ExternalLink[];
  homePage?: "updates" | "courses" | "docs";
  guestGroupId?: string | null;
  /** Server-owned identity of the built-in team; settings forms cannot replace it. */
  organizationTeamId?: string | null;
  docCategoryOrder?: string[];
  docSections?: import("./docs-navigation").DocSection[];
  contentCategories?: import("./content-categories").ContentCategories;
  newUserStage?: "existing" | "newhire";
  dueDatesEnabled?: boolean;
  onboardingDays?: number;
  catchUpDays?: number;
  privacy?: PrivacySettings;
  welcomeDescription?: string;
  name: string;
  accent: string;
  cardPalette?: import("./card-art").CardPaletteSetting;
  access: "public" | "private";
  registration: "open" | "closed";
};
export const defaultSettings: SiteSettings = {
  externalLinks: [],
  homePage: "courses",
  guestGroupId: null,
  organizationTeamId: null,
  newUserStage: "existing",
  dueDatesEnabled: true,
  onboardingDays: 90,
  catchUpDays: 30,
  welcomeDescription: "",
  name: "Fieldbook",
  accent: defaultBrandAccent,
  cardPalette: { mode: "follow" },
  access: "public",
  registration: "open",
};

// Public responses must never include an administrator's unpublished policy.
export function publicSettings(
  settings: SiteSettings,
  content: DocLink[] = [],
): SiteSettings {
  const {
    askAi: _askAi,
    askAiEnabled: _askAiEnabled,
    guestGroupId: _guestGroupId,
    organizationTeamId: _organizationTeamId,
    logoUrl: _legacyLogoUrl,
    tagline: _legacyTagline,
    ...visible
  } = settings as SiteSettings & { logoUrl?: string; tagline?: string };
  const docs = content.filter(
    (item) => item.kind === "doc" && item.status === "published",
  );
  const all = availableDocSections(
    docs,
    settings.docCategoryOrder,
    settings.docSections,
  );
  const sectionIds = new Set<string>();
  const publishedPlacements = new Map<string, string>();
  for (const doc of docs) {
    const section = sectionForDoc(doc, all);
    if (section) {
      publishedPlacements.set(doc.id, section.id);
      sectionIds.add(section.id);
      if (section.parentId) sectionIds.add(section.parentId);
    }
  }
  return {
    ...visible,
    askAiEnabled: settings.askAi?.enabled === true,
    externalLinks: accountMenuLinks(settings.externalLinks),
    contentCategories: settings.contentCategories ? {
      course: settings.contentCategories.course.filter((name) => content.some((item) => item.kind === "course" && item.status === "published" && categoryKey(item.category) === categoryKey(name))),
      brief: settings.contentCategories.brief.filter((name) => content.some((item) => item.kind === "brief" && item.status === "published" && categoryKey(item.category) === categoryKey(name))),
    } : undefined,
    docCategoryOrder: settings.docCategoryOrder?.filter((name) =>
      docs.some((doc) => doc.category === name),
    ),
    docSections: settings.docSections
      ?.filter((section) => sectionIds.has(section.id))
      .map((section) => ({
        ...section,
        ...(section.docOrder
          ? {
              docOrder: section.docOrder.filter(
                (id) => publishedPlacements.get(id) === section.id,
              ),
            }
          : {}),
      })),
    privacy: settings.privacy
      ? {
          ...settings.privacy,
          draft: { ...emptyPrivacyDocument },
        }
      : undefined,
  };
}
export function privacyHref(settings: SiteSettings): string | null {
  const policy = settings.privacy?.published;
  if (!policy) return null;
  return policy.mode === "external" ? policy.url : "/privacy";
}
import {
  availableDocSections,
  sectionForDoc,
  type DocLink,
} from "./docs-navigation";
