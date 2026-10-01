import "server-only";
import type { User, Content } from "@/lib/types";
import { requireAdmin, HttpError } from "./auth";
import { data as dataStore } from "./data";
import { settingsSchema } from "./schemas";
import {
  availableDocSections,
  legacySectionConflict,
  sectionForDoc,
} from "@/lib/docs-navigation";
import type { DocLink } from "@/lib/docs-navigation";
export async function saveSettings(
  user: User | null,
  a: { settings: unknown; expected: number },
) {
  requireAdmin(user);
  const parsed = settingsSchema.safeParse(a.settings);
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  if (!Number.isInteger(a.expected) || a.expected < 1)
    throw new HttpError(400, "A settings revision is required.");
  const config = await dataStore().readSettingsContext();
  if (!config) throw new HttpError(503, "Settings are unavailable. Try again.");
  const selected = parsed.data.guestGroupId;
  if (selected && selected !== config.settings.guestGroupId) {
    if (!config.groups.some((g: { id: string }) => g.id === selected))
      throw new HttpError(
        400,
        "That learning group is unavailable. Choose another group or None.",
      );
  }
  if (
    JSON.stringify(parsed.data.docSections) !==
    JSON.stringify(config.settings.docSections)
  ) {
    const rows = await dataStore().listDocumentPlacements();
    const docs: DocLink[] = rows.flatMap((row) =>
      [row.draft, row.published]
        .filter((item): item is Content => item?.kind === "doc")
        .map((item) => ({
          id: row.id,
          title: item.title,
          category: item.category,
          folder: item.folder || "",
          sectionId: item.sectionId,
          kind: "doc" as const,
          status: item.status,
        })),
    );
    const conflict = legacySectionConflict(docs);
    if (conflict) throw new HttpError(400, conflict);
    const previous = availableDocSections(
      docs,
      config.settings.docCategoryOrder || [],
      config.settings.docSections || [],
    );
    const next = parsed.data.docSections || [];
    for (const section of previous) {
      if (next.some((item) => item.id === section.id)) continue;
      if (docs.some((doc) => sectionForDoc(doc, previous)?.id === section.id))
        throw new HttpError(
          400,
          "Move this section's draft and published documents before deleting it.",
        );
      if (
        previous.some(
          (item) =>
            item.parentId === section.id &&
            next.some((candidate) => candidate.id === item.id),
        )
      )
        throw new HttpError(
          400,
          "Move subsections before deleting this section.",
        );
    }
    for (const doc of docs) {
      if (
        doc.sectionId &&
        !next.some((section) => section.id === doc.sectionId)
      )
        throw new HttpError(
          400,
          "A draft or published Doc refers to a missing section.",
        );
    }
  }
  const data = await dataStore().updateSettings(
    parsed.data,
    a.expected,
    config.governance_revision,
  );
  if (!data)
    throw new HttpError(409, "Settings changed. Reload before saving.");
  return data;
}
