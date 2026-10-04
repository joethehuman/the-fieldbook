import type { Workspace } from "./store";
import type { SiteSettings } from "./settings";
import type { BulkRequest, BulkResult } from "./bulk-actions";
import { availableDocSections } from "./docs-navigation";
import { createSettingsSaver } from "./settings-save";
import type { Content } from "./types";

export type DocNavigationMove = {
  id: string;
  sectionId: string;
  expected: number;
};
export type DocNavigationSaveResult = {
  data: Workspace;
  remaining: DocNavigationMove[];
  error?: string;
};
export type SaveDocsNavigation = (
  before: Workspace,
  settings: SiteSettings,
  moves: DocNavigationMove[],
) => Promise<DocNavigationSaveResult>;

/** Settings and metadata use their existing revision-checked operations. Partial
 * completion is explicit; retry only the remaining moves, never publish drafts. */
export async function saveDocsNavigation(
  before: Workspace,
  settings: SiteSettings,
  moves: DocNavigationMove[],
  save: (before: Workspace, settings: SiteSettings) => Promise<Workspace>,
  move: (
    request: BulkRequest,
  ) => Promise<{ data: Workspace; results: BulkResult[] }>,
): Promise<DocNavigationSaveResult> {
  if (!moves.length)
    return { data: await save(before, settings), remaining: [] };
  const oldSections = availableDocSections(
    [...before.content, ...(before.publishedContent || [])].filter(
      (item) => item.kind === "doc",
    ),
    before.settings?.docCategoryOrder,
    before.settings?.docSections,
  );
  // Keep source sections until documents have left them. This also allows moves
  // into a newly created destination before removing now-empty source sections.
  const interim = {
    ...settings,
    docSections: [
      ...(settings.docSections || []),
      ...oldSections.filter(
        (section) =>
          !settings.docSections?.some((next) => next.id === section.id),
      ),
    ],
  };
  let current = await save(before, interim);
  let remaining = [...moves];
  const messages: string[] = [];
  const destinations = [...new Set(moves.map((item) => item.sectionId))];
  for (const destination of destinations) {
    const group = moves.filter((item) => item.sectionId === destination);
    for (let offset = 0; offset < group.length; offset += 100) {
      const batch = group.slice(offset, offset + 100);
      try {
        const result = await move({
          entity: "content",
          operation: "section",
          value: destination,
          items: batch.map(({ id, expected }) => ({ id, expected })),
        });
        current = result.data;
        const confirmed = new Set(
          result.results
            .filter((item) => item.status !== "failed")
            .map((item) => item.id),
        );
        remaining = remaining.filter((item) => !confirmed.has(item.id));
        messages.push(
          ...result.results
            .filter((item) => item.status === "failed")
            .map((item) => item.message || "A document could not be moved."),
        );
      } catch (error) {
        messages.push((error as Error).message);
        return {
          data: current,
          remaining,
          error: `Section settings were saved. Remaining document moves are still unsaved. ${messages.join(" ")}`,
        };
      }
    }
  }
  if (remaining.length)
    return {
      data: current,
      remaining,
      error: `Some changes were saved. ${remaining.length} document moves remain unsaved. ${[...new Set(messages)].join(" ")}`,
    };
  try {
    current = await save(current, settings);
    return { data: current, remaining: [] };
  } catch (error) {
    return {
      data: current,
      remaining: [],
      error: `Document moves were saved. Remaining section changes are still unsaved. ${(error as Error).message}`,
    };
  }
}

export function createDocsNavigationSaver(
  send: (path: string, body: unknown) => Promise<unknown>,
  load: () => Promise<Workspace>,
): SaveDocsNavigation {
  const save = createSettingsSaver(send, load);
  return (before, settings, moves) =>
    saveDocsNavigation(before, settings, moves, save, async (request) => {
      try {
        const response = (await send("/api/admin/bulk", request)) as {
          results: BulkResult[];
        };
        return { data: await load(), results: response.results };
      } catch (error) {
        // A lost response is checked by reading; never replay a content mutation.
        const latest = await load();
        const results: BulkResult[] = await Promise.all(
          request.items.map(async ({ id }) => {
            const draft = latest.content.find((item) => item.id === id);
            // The compact Admin index mirrors draft placement for its publication
            // summary. Read the actual published copy before confirming a lost write.
            let publishedMatches = !draft?.publishedRevision;
            if (draft && draft.sectionId === request.value && draft.publishedRevision) {
              try {
                const published = (await send(
                  `/api/content?id=${encodeURIComponent(id)}&snapshot=published`,
                  undefined,
                )) as Content;
                publishedMatches = published.sectionId === request.value;
              } catch {
                publishedMatches = false;
              }
            }
            return draft?.sectionId === request.value && publishedMatches
              ? { id, status: "unchanged" }
              : {
                  id,
                  status: "failed",
                  message: `Could not confirm this move. Reload and review before retrying. ${(error as Error).message}`,
                };
          }),
        );
        return { data: latest, results };
      }
    });
}
