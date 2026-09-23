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
  newUserStage?: "existing" | "newhire";
  onboardingDays?: number;
  catchUpDays?: number;
  privacy?: PrivacySettings;
  welcomeDescription?: string;
  name: string;
  tagline: string;
  logoUrl: string;
  accent: string;
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
  tagline: "The Fieldbook | A Lightweight, Opinionated, Open-Source LMS",
  logoUrl: "",
  accent: "#0069ff",
  access: "public",
  registration: "open",
};

// Public responses must never include an administrator's unpublished policy.
export function publicSettings(settings: SiteSettings): SiteSettings {
  const { guestGroupId: _guestGroupId, ...visible } = settings;
  return {
    ...visible,
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
