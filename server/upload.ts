import "server-only";
import { z } from "zod";
import type { User } from "@/lib/types";
import { HttpError, requireAdmin } from "./auth";
import { mediaData } from "./media-data";
import { storage } from "./storage";

const types: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export async function uploadMedia(user: User | null, input: unknown) {
  requireAdmin(user);
  const a = input as { complete?: unknown };
  if (a.complete) {
    const id = z.uuid().parse(a.complete),
      media = await mediaData().findOwnedUpload(id, user.id);
    if (
      media.path.split("/").length !== 2 ||
      media.path.split("/")[0] !== user.id
    )
      throw new HttpError(
        400,
        "Upload verification failed. Retry with a supported file.",
      );
    const file = await storage().metadata(media.path);
    if (!file || file.size !== media.bytes || file.mime !== media.mime)
      throw new HttpError(
        400,
        "Upload verification failed. Retry with a supported file.",
      );
    await mediaData().markReady(id);
    return { url: `/api/media/${id}.${types[media.mime]}` };
  }
  const parsed = z
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
    .safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Upload a PNG, JPG, WebP, GIF, MP4, or WebM file of at most 50 MB.",
    );
  if (!(await mediaData().allowUpload(user.id)))
    throw new HttpError(429, "The hourly upload limit has been reached.");
  const id = crypto.randomUUID(),
    path = `${user.id}/${id}.${types[parsed.data.type]}`;
  await mediaData().registerUpload({
    id,
    path,
    filename: parsed.data.name,
    mime: parsed.data.type,
    bytes: parsed.data.size,
    owner: user.id,
  });
  return { id, upload: await storage().createUpload(path, parsed.data.type) };
}
