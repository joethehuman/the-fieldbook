import { actor, errorResponse, HttpError } from "@production/lib/auth";
import { db, check } from "@production/lib/db";
import { canRead } from "@production/lib/content";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  try {
    const { file } = await params;
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif|mp4|webm)$/.test(file))
      throw new HttpError(404, "Media not found.");
    const user = await actor(),
      config = await canRead(user),
      id = file.split(".")[0];
    const { data: media, error } = await db()
      .from("fb_media")
      .select("*")
      .eq("id", id)
      .eq("ready", true)
      .maybeSingle();
    check(error);
    if (!media) throw new HttpError(404, "Media not found.");
    if (user?.role !== "admin") {
      const { data: docs, error: e } = await db()
        .from("fb_documents")
        .select("published")
        .not("published", "is", null);
      check(e);
      const used =
        config.settings.logoUrl === `/api/media/${file}` ||
        (docs || []).some((d) =>
          JSON.stringify(d.published).includes(`/api/media/${file}`),
        );
      if (!used) throw new HttpError(404, "Media not found.");
    }
    const { data: signed, error: signError } = await db()
      .storage.from("fieldbook-media")
      .createSignedUrl(media.path, 300);
    check(signError);
    return new Response(null, {
      status: 307,
      headers: {
        Location: signed!.signedUrl,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e, "api/media/[file]");
  }
}
