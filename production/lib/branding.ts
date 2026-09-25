import "server-only";
import { db, check } from "./db";
import { brandingFromSettings } from "@/lib/branding";
import { defaultPrivacy, emptyPrivacyDocument } from "@/lib/settings";
import { ServiceError } from "./errors";
// Deliberate projection: no drafts, registration rules, learning settings or revisions.
export async function publicBranding() {
  const { data, error } = await db()
    .from("fb_config")
    .select(
      "name:settings->>name,welcomeDescription:settings->>welcomeDescription,access:settings->>access,policyMode:settings->privacy->published->>mode,policyUrl:settings->privacy->published->>url",
    )
    .eq("id", true)
    .single();
  check(error);
  if (!data)
    throw new ServiceError(
      "Workspace configuration is missing.",
      "configuration",
    );
  const branding = brandingFromSettings({
    name: data.name || undefined,
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
