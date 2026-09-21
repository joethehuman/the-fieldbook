import { defaultSettings, privacyHref, type SiteSettings } from "./settings";
export type Branding = {
  name: string;
  logoUrl: string;
  welcomeDescription: string;
  privacyUrl: string | null;
  access: "public" | "private";
};
export const logoReference =
  /^\/api\/media\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/;
export function brandingFromSettings(
  settings: Partial<SiteSettings>,
): Branding {
  const policy = privacyHref({ ...defaultSettings, ...settings });
  return {
    name: settings.name?.trim().slice(0, 60) || defaultSettings.name,
    logoUrl:
      settings.logoUrl && logoReference.test(settings.logoUrl)
        ? settings.logoUrl
        : "",
    welcomeDescription: settings.welcomeDescription?.trim().slice(0, 180) || "",
    privacyUrl:
      policy && (policy === "/privacy" || /^https:\/\//i.test(policy))
        ? policy
        : null,
    access: settings.access === "private" ? "private" : "public",
  };
}
