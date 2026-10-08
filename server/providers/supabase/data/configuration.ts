import "server-only";
import type {
  DataStore,
  ConfigurationRecord,
  PublicBrandingRecord,
} from "../../../ports/data";
import { db, check } from "../client";
import { env } from "../../../env";

export const configurationData: Pick<
  DataStore,
  | "cacheNamespace"
  | "readConfiguration"
  | "readSettings"
  | "readSettingsContext"
  | "readPublicBranding"
  | "updateSettings"
> = {
  cacheNamespace() {
    return env().url;
  },
  async readConfiguration() {
    const { data, error } = await db().from("fb_config").select("*").single();
    check(error);
    return data as ConfigurationRecord;
  },
  async readSettings() {
    const { data, error } = await db()
      .from("fb_config")
      .select("settings")
      .eq("id", true)
      .single();
    check(error);
    return data as Pick<ConfigurationRecord, "settings"> | null;
  },
  async readSettingsContext() {
    const { data, error } = await db()
      .from("fb_config")
      .select("settings,groups,teams,governance_revision")
      .eq("id", true)
      .single();
    check(error);
    return data as Pick<
      ConfigurationRecord,
      "settings" | "groups" | "teams" | "governance_revision"
    > | null;
  },
  async readPublicBranding() {
    const { data, error } = await db()
      .from("fb_config")
      .select(
        "name:settings->>name,accent:settings->>accent,homePage:settings->>homePage,welcomeDescription:settings->>welcomeDescription,access:settings->>access,policyMode:settings->privacy->published->>mode,policyUrl:settings->privacy->published->>url",
      )
      .eq("id", true)
      .single();
    check(error);
    return data as PublicBrandingRecord | null;
  },
  async updateSettings(settings, expected, governanceExpected) {
    const { data, error } = await db()
      .from("fb_config")
      .update({ settings, revision: expected + 1 })
      .eq("id", true)
      .eq("revision", expected)
      .eq("governance_revision", governanceExpected)
      .select("revision")
      .maybeSingle();
    check(error);
    return data as { revision: number } | null;
  },
};
