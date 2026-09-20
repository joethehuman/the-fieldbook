import "server-only";
import type { Content, User } from "@/lib/types";
import { db, check } from "./db";
import { requireAdmin, HttpError } from "./auth";
import { contentSchema } from "./schemas";
import { videoSource } from "@/lib/video";

export function redact(c: Content): Content {
  return {
    ...c,
    groups: [],
    assignments: [],
    questions: c.questions.map(({ answer, ...q }) => q),
  };
}
export function document(row: any, draft = false): Content {
  return {
    ...(draft ? row.draft : row.published),
    revision: row.revision,
    publishedRevision: row.published_revision,
  };
}
export async function canRead(user: User | null) {
  const { data, error } = await db().from("fb_config").select("*").single();
  check(error);
  if (data.settings.access === "private" && !user)
    throw new HttpError(401, "Sign in to view this Fieldbook.");
  return data;
}
export async function getContent(id: string, user: User | null, draft = false) {
  await canRead(user);
  if (draft) requireAdmin(user);
  const { data, error } = await db()
    .from("fb_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  check(error);
  if (!data || (!draft && !data.published))
    throw new HttpError(404, "Content not found.");
  const c = document(data, draft);
  return draft ? c : redact(c);
}
export async function saveContent(
  user: User | null,
  input: unknown,
  expected: number,
  publish = false,
  source = "web",
  unpublish = false,
) {
  requireAdmin(user);
  const parsed = contentSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error.issues.map((i) => i.message).join(" "),
    );
  const c = parsed.data;
  if (
    c.assignments?.some((a) => !a.groupId || a.userId || a.due.type !== "none")
  )
    throw new HttpError(
      400,
      "Required learning uses groups and workspace learning windows.",
    );
  const { data: old, error } = await db()
    .from("fb_documents")
    .select("*")
    .eq("id", c.id)
    .maybeSingle();
  check(error);
  if (expected !== (old?.revision ?? 0))
    throw new HttpError(
      409,
      "This item changed since you opened it. Reload before saving.",
    );
  if (
    old &&
    (c.kind !== old.draft.kind ||
      c.version < old.draft.version ||
      c.version > old.draft.version + 1)
  )
    throw new HttpError(
      400,
      "Content type cannot change; the course version can increase by one.",
    );
  if (
    publish &&
    c.kind === "course" &&
    (!c.lessons.length ||
      c.lessons.some(
        (l) => !l.title.trim() || (!l.body.trim() && !l.videoUrl),
      ) ||
      c.questions.some(
        (q) =>
          !q.prompt.trim() ||
          q.options.some((o) => !o.trim()) ||
          q.answer === undefined ||
          q.answer >= q.options.length,
      ))
  )
    throw new HttpError(
      400,
      "Published courses need complete lessons and valid quiz answers.",
    );
  if (c.lessons.some((l) => l.videoUrl && !videoSource(l.videoUrl)))
    throw new HttpError(400, "Unsupported video URL.");
  const serialized = JSON.stringify(c);
  const mediaIds = [
    ...serialized.matchAll(
      /\/api\/media\/([a-f0-9-]{36})\.(?:png|jpg|webp|gif|mp4|webm)/g,
    ),
  ].map((m) => m[1]);
  if (mediaIds.length) {
    const { data: media, error: mediaError } = await db()
      .from("fb_media")
      .select("id")
      .in("id", mediaIds)
      .eq("ready", true);
    check(mediaError);
    if (new Set(media?.map((m) => m.id)).size !== new Set(mediaIds).size)
      throw new HttpError(400, "One or more media uploads are not ready.");
  }
  const now = new Date().toISOString();
  const { revision, publishedRevision, ...clean } = c;
  const draft = {
    ...clean,
    status: publish ? "published" : "draft",
    createdAt: old?.draft.createdAt || now,
    updatedAt: now,
  };
  const { data: saved, error: saveError } = await db().rpc("fb_save_document", {
    p_id: c.id,
    p_expected: expected,
    p_draft: draft,
    p_publish: publish,
    p_unpublish: unpublish,
    p_actor: user.id,
    p_source: source,
  });
  if (saveError?.code === "P0001")
    throw new HttpError(
      saveError.message.includes("Revision conflict") ? 409 : 400,
      saveError.message,
    );
  check(saveError);
  return document(saved, true);
}
