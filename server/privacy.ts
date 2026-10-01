import "server-only";
import { data as dataStore } from "./data";
import {
  defaultSettings,
  publicSettings,
  type SiteSettings,
} from "@/lib/settings";
// Available before login, including on private installations. Never return drafts.
export async function privacySettings(): Promise<SiteSettings> {
  const data = await dataStore().readSettings();
  if (!data) throw new Error("Workspace configuration is missing.");
  return publicSettings({ ...defaultSettings, ...data.settings });
}
