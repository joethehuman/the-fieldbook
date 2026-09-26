import "server-only";
import { cache } from "react";
import type { Content, User } from "@/lib/types";
import { db, check } from "./db";
import { requireAdmin, HttpError } from "./auth";
import { contentSchema } from "./schemas";
import { videoSource } from "@/lib/video";
import { hasMissingImageAlt } from "@/lib/markdown-compatibility";
import { correctOptionIds, requiresPassing, validQuestion } from "@/lib/course-quiz";
import {
  availableDocSections,
  sectionForDoc,
  legacySectionConflict,
} from "@/lib/docs-navigation";

export function redact(c: Content): Content {
  return {
    ...c,
    groups: [],
    assignments: [],
    questions: c.questions.map((question) => {
      const { answer, correctOptionIds: correct, ...safe } = question;
      return { ...safe, multiple: correctOptionIds(question).length > 1 };
    }),
  };
}
export function document(row: any, draft = false): Content {
  return {
    ...(draft ? row.draft : row.published),
    revision: row.revision,
    publishedRevision: row.published_revision,
  };
}
export const readConfig = cache(async () => {
  const { data, error } = await db().from("fb_config").select("*").single();
  check(error);
  return data;
});
export function assertCanRead(
  user: User | null,
  config: Awaited<ReturnType<typeof readConfig>>,
) {
  if (config.settings.access === "private" && !user)
    throw new HttpError(401, "Sign in to view this Fieldbook.");
}
export const canRead = cache(async (user: User | null) => {
  const config = await readConfig();
  assertCanRead(user, config);
  return config;
});
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
  if (c.kind === "doc") {
    const conflict = legacySectionConflict([c]);
    if (conflict) throw new HttpError(400, conflict);
    const { data: config, error: settingsError } = await db()
      .from("fb_config")
      .select("settings")
      .eq("id", true)
      .single();
    check(settingsError);
    if (!config)
      throw new HttpError(503, "Settings are unavailable. Try again.");
    if (c.sectionId) {
      const sections = availableDocSections(
        [],
        config.settings.docCategoryOrder || [],
        config.settings.docSections || [],
      );
      let section = sectionForDoc(c, sections);
      if (!section && c.sectionId.startsWith("legacy:")) {
        // Old documents can still choose a legacy section before settings
        // have been saved in the new format.
        const legacy = availableDocSections(
          [{ ...c, sectionId: undefined }],
          config.settings.docCategoryOrder || [],
          config.settings.docSections || [],
        );
        section = sectionForDoc(c, legacy);
        if (section)
          sections.push(
            ...legacy.filter(
              (item) => !sections.some((saved) => saved.id === item.id),
            ),
          );
      }
      if (!section)
        throw new HttpError(400, "Choose an existing Docs section.");
      const parent = sections.find((item) => item.id === section.parentId);
      c.category = parent?.name || section.name;
      c.folder = parent ? section.name : "";
    }
  }
  if (
    c.assignments?.some((a) => !a.groupId || a.userId || a.due.type !== "none")
  )
    throw new HttpError(
      400,
      "Assigned courses use learning groups and organization windows.",
    );
  const { data: old, error } = await db()
    .from("fb_documents")
    .select("*")
    .eq("id", c.id)
    .maybeSingle();
  check(error);
  if (c.kind === "course" && c.requirePassing === undefined && !old?.published)
    c.requirePassing = false;
  if (publish && c.kind === "course" && old?.published?.kind === "course" &&
    requiresPassing(c) !== requiresPassing(old.published as Content) &&
    c.version === old.published.version)
    throw new HttpError(400, "Changing the quiz completion rule requires publishing a new course version.");
  if (expected !== (old?.revision ?? 0))
    throw new HttpError(
      409,
      "This item changed since you opened it. Reload before saving.",
    );
  if (c.kind === "course") {
    const audience = (groups: string[] = []) =>
      JSON.stringify([...groups].sort());
    const rules = (value: Content["assignments"] = []) =>
      JSON.stringify(value.map((a) => a.groupId).sort());
    if (
      audience(c.groups) !== audience(old?.draft.groups) ||
      rules(c.assignments) !== rules(old?.draft.assignments)
    )
      throw new HttpError(400, "Manage assigned courses in Learning groups.");
  }
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
      c.questions.some((q) => !validQuestion(q)))
  )
    throw new HttpError(
      400,
      "Published courses need complete lessons and valid quiz answers.",
    );
  if (c.lessons.some((l) => l.videoUrl && !videoSource(l.videoUrl)))
    throw new HttpError(400, "Unsupported video URL.");
  if (publish && c.kind === "course" && c.lessons.some((l) => hasMissingImageAlt(l.body)))
    throw new HttpError(400, "Add alternative text to every lesson image before publishing.");
  const serialized = JSON.stringify(c);
  const mediaIds = [
    ...serialized.matchAll(
      /\/api\/media\/([a-f0-9-]{36})\.(?:png|jpg|webp|gif|mp4|webm)/g,
    ),
  ].map((m) => m[1]);
  if (mediaIds.length) {
    const { data: media, error: mediaError } = await db()
      .from("fb_media")
      .select("id,mime")
      .in("id", mediaIds)
      .eq("ready", true);
    check(mediaError);
    if (new Set(media?.map((m) => m.id)).size !== new Set(mediaIds).size)
      throw new HttpError(400, "One or more media uploads are not ready.");
    if (c.coverImageUrl) {
      const coverId = c.coverImageUrl.split("/").pop()!.split(".")[0];
      const cover = media?.find((m) => m.id === coverId);
      if (
        !cover ||
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          cover.mime,
        )
      )
        throw new HttpError(
          400,
          "Choose a ready image upload for the course cover.",
        );
    }
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
