import "server-only";
import type { User } from "@/lib/types";
import { HttpError } from "./errors";
import { db, check } from "./db";
import { canRead } from "./content";

export async function signedMediaUrl(file: string, user: User | null) {
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif|mp4|webm)$/.test(file))
    throw new HttpError(404, "Media not found.");
  await canRead(user);
  const { data: media, error } = await db()
    .from("fb_media")
    .select("path")
    .eq("id", file.split(".")[0])
    .eq("ready", true)
    .maybeSingle();
  check(error);
  if (!media || media.path.split("/").pop() !== file)
    throw new HttpError(404, "Media not found.");
  const reference = `/api/media/${file}`;
  if (user?.role !== "admin") {
    // Filter in the database before limiting. JSON ->> extracts lesson arrays as
    // text too, covering inline lesson media and lesson videoUrl references.
    // The validated filename cannot introduce PostgREST operators or wildcards.
    const { data, error: referenceError } = await db()
      .from("fb_documents")
      .select("id")
      .not("published", "is", null)
      .or(
        [
          `published->>body.like.%${reference}%`,
          `published->>summary.like.%${reference}%`,
          `published->>lessons.like.%${reference}%`,
          `published->>coverImageUrl.eq.${reference}`,
        ].join(","),
      )
      .limit(1);
    check(referenceError);
    if (!data?.length) throw new HttpError(404, "Media not found.");
  }
  const { data: signed, error: signError } = await db()
    .storage.from("fieldbook-media")
    .createSignedUrl(media.path, 300);
  check(signError);
  return signed!.signedUrl;
}
