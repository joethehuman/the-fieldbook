import { defaultBrandAccent } from "./brand-theme";

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
  guestGroupId?: string | null;
  docCategoryOrder?: string[];
  docSections?: import("./docs-navigation").DocSection[];
  newUserStage?: "existing" | "newhire";
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
  guestGroupId: null,
  newUserStage: "existing",
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
    guestGroupId: _guestGroupId,
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
  for (const doc of docs) {
    const section = sectionForDoc(doc, all);
    if (section) {
      sectionIds.add(section.id);
      if (section.parentId) sectionIds.add(section.parentId);
    }
  }
  return {
    ...visible,
    docCategoryOrder: settings.docCategoryOrder?.filter((name) =>
      docs.some((doc) => doc.category === name),
    ),
    docSections: settings.docSections?.filter((section) =>
      sectionIds.has(section.id),
    ),
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
