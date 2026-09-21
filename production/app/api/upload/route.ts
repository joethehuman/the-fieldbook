import {
  actor,
  requireAdmin,
  sameOrigin,
  errorResponse,
  HttpError,
} from "@production/lib/auth";
import { db, check } from "@production/lib/db";
import { z } from "zod";
const types: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    requireAdmin(user);
    const a = await req.json();
    if (a.complete) {
      const id = z.uuid().parse(a.complete);
      const { data: m, error } = await db()
        .from("fb_media")
        .select("*")
        .eq("id", id)
        .eq("owner", user.id)
        .single();
      check(error);
      const { data: files, error: listError } = await db()
        .storage.from("fieldbook-media")
        .list(user.id, { search: m.path.split("/")[1], limit: 1 });
      check(listError);
      const f = files?.find((f) => `${user.id}/${f.name}` === m.path);
      if (!f || f.metadata?.size !== m.bytes || f.metadata?.mimetype !== m.mime)
        throw new HttpError(
          400,
          "Upload verification failed. Retry with a supported file.",
        );
      const { error: readyError } = await db()
        .from("fb_media")
        .update({ ready: true })
        .eq("id", id);
      check(readyError);
      return Response.json({ url: `/api/media/${id}.${types[m.mime]}` });
    }
    const p = z
      .object({
        name: z.string().min(1).max(255),
        type: z.enum([
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
          "video/mp4",
          "video/webm",
        ]),
        size: z
          .number()
          .int()
          .positive()
          .max(
            Math.min(
              Number(process.env.FIELDBOOK_UPLOAD_MAX_BYTES) || 52428800,
              52428800,
            ),
          ),
      })
      .safeParse(a);
    if (!p.success)
      throw new HttpError(
        400,
        "Upload a PNG, JPG, WebP, GIF, MP4, or WebM file of at most 50 MB.",
      );
    const { data: allowed, error: rateError } = await db().rpc(
      "fb_allow_request",
      { p_key: `uploads:${user.id}`, p_limit: 20, p_seconds: 3600 },
    );
    check(rateError);
    if (!allowed)
      throw new HttpError(429, "The hourly upload limit has been reached.");
    const id = crypto.randomUUID(),
      path = `${user.id}/${id}.${types[p.data.type]}`;
    const { error } = await db()
      .from("fb_media")
      .insert({
        id,
        path,
        filename: p.data.name,
        mime: p.data.type,
        bytes: p.data.size,
        owner: user.id,
      });
    check(error);
    const { data: signed, error: signError } = await db()
      .storage.from("fieldbook-media")
      .createSignedUploadUrl(path, { upsert: false });
    check(signError);
    return Response.json(
      { id, path, token: signed!.token },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e, "api/upload");
  }
}
