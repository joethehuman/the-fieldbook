import "server-only";
import type { User, Content } from "@/lib/types";
import { requireAdmin, HttpError } from "./auth";
import { data as dataStore } from "./data";
import { settingsSchema } from "./schemas";
import { ai } from "./ai";
import { requireAiRouter, selectionRouter } from "./ai-router";
import { defaultAskAiSettings } from "@/lib/ai";
import {
  availableDocSections,
  legacySectionConflict,
  sectionForDoc,
} from "@/lib/docs-navigation";
import type { DocLink } from "@/lib/docs-navigation";
import { organizationTeam } from "@/lib/organization-team";
import { assertCategoriesCanBeRemoved } from "@/lib/content-categories";
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
  const previousAi = config.settings.askAi ?? defaultAskAiSettings;
  let nextAi = parsed.data.askAi;
  const provider = nextAi?.enabled ? ai() : null;
  if (nextAi?.enabled && provider) {
    requireAiRouter(nextAi, provider);
    nextAi = { ...nextAi, router: provider.id };
  }
  // Disabling and unrelated saves must work when the AI service is unavailable.
  if (
    nextAi?.enabled &&
    (!previousAi.enabled ||
      selectionRouter(nextAi) !== selectionRouter(previousAi) ||
      nextAi.model !== previousAi.model ||
      nextAi.fallbackModel !== (previousAi.fallbackModel ?? ""))
  ) {
    const signal = AbortSignal.timeout(10_000);
    await provider!.validateModel(nextAi.model, signal);
    if (nextAi.fallbackModel)
      await provider!.validateModel(nextAi.fallbackModel, signal);
    await Promise.all([
      dataStore().searchAiPassages([], nextAi.sources, signal),
      dataStore().areAiSourcesCurrent([], signal),
    ]);
  }
  const selected = parsed.data.guestGroupId;
  if (selected && selected !== config.settings.guestGroupId) {
    if (!config.groups.some((g: { id: string }) => g.id === selected))
      throw new HttpError(
        400,
        "That learning group is unavailable. Choose another group or None.",
      );
  }
  const selectedTeam = parsed.data.organizationTeamId;
  const root = organizationTeam(
    config.teams || [],
    config.settings.organizationTeamId,
  );
  if (!root || root.id !== config.settings.organizationTeamId)
    throw new HttpError(
      503,
      "Organization team setup is incomplete. Apply the matching migration before saving.",
    );
  if (selectedTeam !== undefined && selectedTeam !== root.id)
    throw new HttpError(
      400,
      "The built-in Organization team cannot be changed or removed.",
    );
  parsed.data.organizationTeamId = root.id;
  // Older clients must preserve optional category configuration they did not load.
  if (!parsed.data.contentCategories && config.settings.contentCategories)
    parsed.data.contentCategories = config.settings.contentCategories;
  if (
    parsed.data.contentCategories &&
    JSON.stringify(parsed.data.contentCategories) !==
      JSON.stringify(config.settings.contentCategories)
  ) {
    const rows = await dataStore().listDocumentPlacements();
    try {
      assertCategoriesCanBeRemoved(
        config.settings,
        parsed.data.contentCategories,
        rows.flatMap((row) =>
          [row.draft, row.published].filter((item): item is Content => !!item),
        ),
      );
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
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
          "Move this section’s items elsewhere before deleting it.",
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
          "Move this section’s items elsewhere before deleting it.",
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
  const settings = {
    ...parsed.data,
    ...(nextAi ? { askAi: nextAi } : {}),
    // Some installations already enforce this identity in database triggers.
    // It is not an editable setting and must come from the saved configuration.
    ...(config.settings.organizationTeamId
      ? { organizationTeamId: config.settings.organizationTeamId }
      : {}),
    // Older loaded Admin clients must not erase a new optional configuration.
    ...(parsed.data.askAi === undefined && config.settings.askAi
      ? { askAi: config.settings.askAi }
      : {}),
  };
  const data = await dataStore().updateSettings(
    settings,
    a.expected,
    config.governance_revision,
  );
  if (!data)
    throw new HttpError(409, "Settings changed. Reload before saving.");
  return { ...data, settings };
}
