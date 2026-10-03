import "server-only";
import { cache } from "react";
import type { Content, User } from "@/lib/types";
import { data as dataStore } from "./data";
import { requirePublisher, HttpError } from "./auth";
import { contentSignature } from "@/lib/demo-publication";
import { contentDraftSchema, contentSchema } from "./schemas";
import { isArtworkOnlyUpdate } from "@/lib/card-art";
import { videoSource } from "@/lib/video";
import { hasMissingImageAlt } from "@/lib/markdown-compatibility";
import {
  correctOptionIds,
  requiresPassing,
  validQuestion,
} from "@/lib/course-quiz";
import {
  availableDocSections,
  sectionForDoc,
  legacySectionConflict,
} from "@/lib/docs-navigation";

export function redact(c: Content): Content {
  const { publishedSignature, updateTeams, ...safeContent } = c;
  return {
    ...safeContent,
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
    ...(draft && row.published
      ? { publishedSignature: contentSignature(row.published) }
      : {}),
  };
}
export const readConfig = cache(async () => {
  return dataStore().readConfiguration();
});
export function assertCanRead(
  user: User | null,
  config: Pick<Awaited<ReturnType<typeof readConfig>>, "settings">,
) {
  if (config.settings.access === "private" && !user)
    throw new HttpError(401, "Sign in to view this Fieldbook.");
}
export const canRead = cache(async (user: User | null) => {
  const config = await readConfig();
  assertCanRead(user, config);
  return config;
});
export async function getContent(id: string, user: User | null, draft = false, publishedForEditing = false) {
  await canRead(user);
  if (draft || publishedForEditing) requirePublisher(user);
  const data = await dataStore().findDocument(id);
  if (!data || data.deleted_at || ((!draft || publishedForEditing) && !data.published))
    throw new HttpError(404, "Content not found.");
  if (publishedForEditing)
    return document({ ...data, draft: data.published }, true);
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
  requirePublisher(user);
  const parsed = (publish ? contentSchema : contentDraftSchema).safeParse(
    input,
  );
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error.issues.map((i) => i.message).join(" "),
    );
  const c = parsed.data;
  const contributor = user.role === "contributor";
  if (publish && !c.summary.trim())
    throw new HttpError(400, "Add a short description before publishing.");
  if (c.kind === "doc") {
    const conflict = legacySectionConflict([c]);
    if (conflict) throw new HttpError(400, conflict);
    const config = await dataStore().readSettings();
    if (!config)
      throw new HttpError(503, "Settings are unavailable. Try again.");
    if (c.sectionId) {
      const sections = availableDocSections(
        contributor
          ? ((await dataStore().listDraftIndex()).filter(
              (doc) => doc.kind === "doc",
            ) as Content[])
          : [],
        config.settings.docCategoryOrder || [],
        config.settings.docSections || [],
      );
      let section = sectionForDoc(c, sections);
      if (!contributor && !section && c.sectionId.startsWith("legacy:")) {
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
    c.assignments?.some((a) => (!a.groupId && !a.teamId) || (!!a.groupId && !!a.teamId) || a.userId || a.due.type !== "none")
  )
    throw new HttpError(
      400,
      "Assigned courses use teams or learning groups and organization windows.",
    );
  const old = await dataStore().findDocument(c.id);
  if (contributor && c.kind === "brief" && JSON.stringify([...(c.updateTeams || [])].sort()) !== JSON.stringify([...(old?.draft.updateTeams || [])].sort()))
    throw new HttpError(403, "Only administrators can change Update team assignments.");
  if (c.updateTeams?.length && c.kind !== "brief")
    throw new HttpError(400, "Team recommendations apply only to Updates.");
  if (c.kind === "brief" && c.updateTeams?.length) {
    const config = await dataStore().readConfiguration();
    if (
      c.updateTeams.some((id) => !config.teams.some((team) => team.id === id) && !old?.draft.updateTeams?.includes(id))
    )
      throw new HttpError(
        400,
        "A team changed. Review the current audience list.",
      );
    c.updateTeams = [...new Set(c.updateTeams)];
  }
  if (old?.deleted_at)
    throw new HttpError(400, "Restore this item before editing it.");
  if (contributor && c.kind === "doc") {
    if (c.sectionOrder !== old?.draft.sectionOrder)
      throw new HttpError(403, "Only administrators can reorder Docs.");
    if (!c.sectionId && (c.category || c.folder)) {
      const placements = await dataStore().listDraftIndex();
      if (
        !placements.some(
          (doc) =>
            doc.kind === "doc" &&
            doc.category === c.category &&
            (doc.folder || "") === c.folder,
        )
      )
        throw new HttpError(403, "Choose an existing Docs section.");
    }
  }
  if (
    contributor &&
    c.kind === "course" &&
    JSON.stringify(c.assignments || []) !==
      JSON.stringify(old?.draft.assignments || [])
  )
    throw new HttpError(
      403,
      "Only administrators can change course assignments.",
    );
  if (c.kind === "course" && c.requirePassing === undefined && !old?.published)
    c.requirePassing = false;
  if (
    publish &&
    c.kind === "course" &&
    old?.published?.kind === "course" &&
    requiresPassing(c) !== requiresPassing(old.published as Content) &&
    c.version === old.published.version
  )
    throw new HttpError(
      400,
      "Changing the quiz completion rule requires publishing a new course version.",
    );
  if (expected !== (old?.revision ?? 0))
    throw new HttpError(
      409,
      "This item changed since you opened it. Reload before saving.",
    );
  if (c.kind === "course") {
    const audience = (groups: string[] = []) =>
      JSON.stringify([...groups].sort());
    const rules = (value: Content["assignments"] = []) =>
      JSON.stringify(value.map(a => a.groupId ? `group:${a.groupId}` : `team:${a.teamId}`).sort());
    if (
      audience(c.groups) !== audience(old?.draft.groups) ||
      rules(c.assignments) !== rules(old?.draft.assignments)
    )
      throw new HttpError(400, "Use the assignment picker to manage course audiences.");
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
  if (
    publish &&
    c.kind === "course" &&
    c.lessons.some((l) => hasMissingImageAlt(l.body))
  )
    throw new HttpError(
      400,
      "Add alternative text to every lesson image before publishing.",
    );
  const serialized = JSON.stringify(c);
  const mediaIds = [
    ...serialized.matchAll(
      /\/api\/media\/([a-f0-9-]{36})\.(?:png|jpg|webp|gif|mp4|webm)/g,
    ),
  ].map((m) => m[1]);
  if (mediaIds.length) {
    const media = await dataStore().findReadyMedia(mediaIds);
    if (new Set(media?.map((m) => m.id)).size !== new Set(mediaIds).size)
      throw new HttpError(400, "One or more media uploads are not ready.");
    for (const imageUrl of [c.coverImageUrl, c.cardArt?.imageUrl].filter(
      Boolean,
    )) {
      const imageId = imageUrl!.split("/").pop()!.split(".")[0];
      const image = media?.find((m) => m.id === imageId);
      if (
        !image ||
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          image.mime,
        )
      )
        throw new HttpError(
          400,
          "Choose a ready image upload for card artwork.",
        );
    }
  }
  const now = new Date().toISOString();
  const artOnlyUpdate =
    publish &&
    old?.published &&
    isArtworkOnlyUpdate(c as Content, old.published as Content);
  const { revision, publishedRevision, ...clean } = c;
  const draft = {
    ...clean,
    status: publish ? ("published" as const) : ("draft" as const),
    createdAt: old?.draft.createdAt || now,
    updatedAt: now,
    ...(c.kind === "brief"
      ? {
          feedAt: artOnlyUpdate
            ? old.published!.feedAt || old.published!.updatedAt
            : now,
        }
      : {}),
  };
  const saved = await dataStore().saveDocument({
    id: c.id,
    expected,
    draft,
    publish,
    unpublish,
    actorId: user.id,
    source,
  });
  return document(saved, true);
}
