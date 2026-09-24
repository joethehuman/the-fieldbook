import {
  actor,
  sameOrigin,
  errorResponse,
  HttpError,
} from "@production/lib/auth";
import { db, check } from "@production/lib/db";
import { getContent } from "@production/lib/content";
import { z } from "zod";
export async function GET(req: Request) {
  try {
    const user = await actor();
    if (!user) throw new HttpError(401, "Sign in to view feedback.");
    const id = z.uuid().parse(new URL(req.url).searchParams.get("contentId"));
    await getContent(id, user);
    const { data, error } = await db()
      .from("fb_feedback")
      .select("rating,comment")
      .eq("user_id", user.id)
      .eq("content_id", id)
      .maybeSingle();
    check(error);
    return Response.json(
      { saved: data || null },
      { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
    );
  } catch (e) {
    return errorResponse(e, "api/feedback");
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    if (!user) throw new HttpError(401, "Sign in to send feedback.");
    const a = z
      .object({
        contentId: z.uuid(),
        rating: z.enum(["up", "down"]),
        comment: z.string().max(5000),
      })
      .parse(await req.json());
    const c = await getContent(a.contentId, user);
    const { error } = await db().from("fb_feedback").upsert(
      {
        id: crypto.randomUUID(),
        user_id: user.id,
        content_id: c.id,
        version: c.version,
        rating: a.rating,
        comment: a.comment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,content_id" },
    );
    check(error);
    return Response.json({ saved: true });
  } catch (e) {
    return errorResponse(e, "api/feedback");
  }
}
