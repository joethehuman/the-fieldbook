import "server-only";
import type { User } from "@/lib/types";
import { requireAdmin, HttpError } from "./auth";
import { db, check } from "./db";
import { readyLogo } from "./branding-logo";
import { settingsSchema } from "./schemas";
export async function saveSettings(
  user: User | null,
  a: { settings: unknown; expected: number },
) {
  requireAdmin(user);
  const parsed = settingsSchema.safeParse(a.settings);
  if (!parsed.success)
    throw new HttpError(400, "Check the branding and access settings.");
  if (!Number.isInteger(a.expected) || a.expected < 1)
    throw new HttpError(400, "A settings revision is required.");
  if (parsed.data.logoUrl) await readyLogo(parsed.data.logoUrl);
  const { data: config, error: configError } = await db()
    .from("fb_config")
    .select("settings,groups,governance_revision")
    .eq("id", true)
    .single();
  check(configError);
  if (!config) throw new HttpError(503, "Settings are unavailable. Try again.");
  const selected = parsed.data.guestGroupId;
  if (selected && selected !== config.settings.guestGroupId) {
    if (!config.groups.some((g: { id: string }) => g.id === selected))
      throw new HttpError(
        400,
        "That learning group is unavailable. Choose another group or None.",
      );
  }
  const { data, error } = await db()
    .from("fb_config")
    .update({ settings: parsed.data, revision: a.expected + 1 })
    .eq("id", true)
    .eq("revision", a.expected)
    .eq("governance_revision", config.governance_revision)
    .select("revision")
    .maybeSingle();
  check(error);
  if (!data)
    throw new HttpError(409, "Settings changed. Reload before saving.");
  return data;
}
