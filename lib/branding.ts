import { defaultSettings, privacyHref, type SiteSettings } from "./settings";
export type Branding = {
  name: string;
  welcomeDescription: string;
  privacyUrl: string | null;
  access: "public" | "private";
};
export function brandingFromSettings(
  settings: Partial<SiteSettings>,
): Branding {
  const policy = privacyHref({ ...defaultSettings, ...settings });
  return {
    name: settings.name?.trim().slice(0, 60) || defaultSettings.name,
    welcomeDescription: settings.welcomeDescription?.trim().slice(0, 180) || "",
    privacyUrl:
      policy && (policy === "/privacy" || /^https:\/\//i.test(policy))
        ? policy
        : null,
    access: settings.access === "private" ? "private" : "public",
  };
}
