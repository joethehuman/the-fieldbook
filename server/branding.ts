import "server-only";
import { data as dataStore } from "./data";
import { brandingFromSettings } from "@/lib/branding";
import { defaultPrivacy, emptyPrivacyDocument } from "@/lib/settings";
import { ServiceError } from "./errors";
// Deliberate projection: no drafts, registration rules, learning settings or revisions.
export async function publicBranding() {
  const data = await dataStore().readPublicBranding();
  if (!data)
    throw new ServiceError(
      "Workspace configuration is missing.",
      "configuration",
    );
  const branding = brandingFromSettings({
    name: data.name || undefined,
    accent: data.accent || undefined,
    homePage:
      data.homePage === "updates" || data.homePage === "docs"
        ? data.homePage
        : "courses",
    welcomeDescription: data.welcomeDescription || undefined,
    access: data.access === "private" ? "private" : "public",
    privacy: {
      ...defaultPrivacy,
      published:
        data.policyMode === "hosted" || data.policyMode === "external"
          ? {
              ...emptyPrivacyDocument,
              mode: data.policyMode,
              url: data.policyUrl || "",
            }
          : null,
    },
  });
  return branding;
}
