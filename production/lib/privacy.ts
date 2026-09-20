import "server-only";
import { db, check } from "./db";
import {
  defaultSettings,
  publicSettings,
  type SiteSettings,
} from "@/lib/settings";
// Available before login, including on private installations. Never return drafts.
export async function privacySettings(): Promise<SiteSettings> {
  const { data, error } = await db()
    .from("fb_config")
    .select("settings")
    .eq("id", true)
    .single();
  check(error);
  if (!data) throw new Error("Workspace configuration is missing.");
  return publicSettings({ ...defaultSettings, ...data.settings });
}
