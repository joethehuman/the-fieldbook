import {
  actor,
  sameOrigin,
  errorResponse,
  requireAdmin,
  HttpError,
} from "@production/lib/auth";
import { db, check } from "@production/lib/db";
import { settingsSchema } from "@production/lib/schemas";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    requireAdmin(user);
    const a = await req.json(),
      parsed = settingsSchema.safeParse(a.settings);
    if (!parsed.success)
      throw new HttpError(400, "Check the branding and access settings.");
    if (!Number.isInteger(a.expected) || a.expected < 1)
      throw new HttpError(400, "A settings revision is required.");
    const { data, error } = await db()
      .from("fb_config")
      .update({ settings: parsed.data, revision: a.expected + 1 })
      .eq("id", true)
      .eq("revision", a.expected)
      .select("revision")
      .maybeSingle();
    check(error);
    if (!data)
      throw new HttpError(409, "Settings changed. Reload before saving.");
    return Response.json(data);
  } catch (e) {
    return errorResponse(e, "api/settings");
  }
}
