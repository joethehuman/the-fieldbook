import "server-only";
import type { MediaDataPort } from "../../ports/media-data";
import { db, check } from "./client";

export const supabaseMediaData: MediaDataPort = {
  async allowUpload(owner) {
    const { data, error } = await db().rpc("fb_allow_request", {
      p_key: `uploads:${owner}`,
      p_limit: 20,
      p_seconds: 3600,
    });
    check(error);
    return data;
  },
  async registerUpload(upload) {
    const { error } = await db().from("fb_media").insert(upload);
    check(error);
  },
  async findOwnedUpload(id, owner) {
    const { data, error } = await db()
      .from("fb_media")
      .select("*")
      .eq("id", id)
      .eq("owner", owner)
      .single();
    check(error);
    return data;
  },
  async markReady(id) {
    const { error } = await db()
      .from("fb_media")
      .update({ ready: true })
      .eq("id", id);
    check(error);
  },
  async findReadyPath(id) {
    const { data, error } = await db()
      .from("fb_media")
      .select("path")
      .eq("id", id)
      .eq("ready", true)
      .maybeSingle();
    check(error);
    return data?.path ?? null;
  },
  async hasPublishedDocumentReference(reference) {
    // The service supplies only a validated UUID filename. Filter before limiting
    // so references beyond the Data API response cap still grant media access.
    const { data, error } = await db()
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
    check(error);
    if (data?.length) return true;
    const { data: artwork, error: artworkError } = await db()
      .from("fb_documents")
      .select("id")
      .not("published", "is", null)
      .eq("published->cardArt->>source", "upload")
      .eq("published->cardArt->>imageUrl", reference)
      .limit(1);
    check(artworkError);
    return Boolean(artwork?.length);
  },
};
