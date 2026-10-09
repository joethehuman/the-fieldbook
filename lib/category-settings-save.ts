import type { Workspace } from "./store";
import type { SiteSettings } from "./settings";
import type { Content } from "./types";
import type { BulkRequest, BulkResult } from "./bulk-actions";
import {
  categoryKey,
  categoryLists,
  type CategoryKind,
} from "./content-categories";
import { createSettingsSaver } from "./settings-save";

export type CategoryMove = {
  id: string;
  kind: CategoryKind;
  category: string;
  expected: number;
};
export type CategorySaveResult = {
  data: Workspace;
  remaining: CategoryMove[];
  error?: string;
};
export type SaveCategories = (
  before: Workspace,
  settings: SiteSettings,
  moves: CategoryMove[],
) => Promise<CategorySaveResult>;

/** Retain source names until revision-checked moves are confirmed. Category
 * removal is a settings write, never a content deletion or publication. */
export async function saveCategorySettings(
  before: Workspace,
  settings: SiteSettings,
  moves: CategoryMove[],
  save: (before: Workspace, settings: SiteSettings) => Promise<Workspace>,
  move: (
    request: BulkRequest,
  ) => Promise<{ data: Workspace; results: BulkResult[] }>,
): Promise<CategorySaveResult> {
  if (!moves.length)
    return { data: await save(before, settings), remaining: [] };
  const source = categoryLists(
    [...before.content, ...(before.publishedContent || [])],
    before.settings,
  );
  const desired = settings.contentCategories!;
  const interim = {
    ...settings,
    contentCategories: {
      course: [
        ...desired.course,
        ...source.course.filter(
          (name) =>
            !desired.course.some(
              (item) => categoryKey(item) === categoryKey(name),
            ),
        ),
      ],
      brief: [
        ...desired.brief,
        ...source.brief.filter(
          (name) =>
            !desired.brief.some(
              (item) => categoryKey(item) === categoryKey(name),
            ),
        ),
      ],
    },
  };
  let current = await save(before, interim);
  let remaining = [...moves];
  const failures: string[] = [];
  const destinations = [
    ...new Set(moves.map((item) => JSON.stringify([item.kind, item.category]))),
  ];
  for (const destination of destinations) {
    const [kind, category] = JSON.parse(destination) as [CategoryKind, string];
    const group = moves.filter(
      (item) => item.kind === kind && item.category === category,
    );
    for (let offset = 0; offset < group.length; offset += 100) {
      const batch = group.slice(offset, offset + 100);
      try {
        const result = await move({
          entity: "content",
          operation: "category",
          value: category,
          items: batch.map(({ id, expected }) => ({ id, expected })),
        });
        current = result.data;
        const confirmed = new Set(
          result.results
            .filter((item) => item.status !== "failed")
            .map((item) => item.id),
        );
        remaining = remaining.filter((item) => !confirmed.has(item.id));
        failures.push(
          ...result.results
            .filter((item) => item.status === "failed")
            .map(
              (item) =>
                `${current.content.find((content) => content.id === item.id)?.title || item.id}: ${item.message || "This item could not be moved."}`,
            ),
        );
      } catch (error) {
        failures.push((error as Error).message);
        return {
          data: current,
          remaining,
          error: `Review ${remaining.length} unconfirmed moves before retrying. Source categories were kept. ${failures.join(" ")}`,
        };
      }
    }
  }
  if (remaining.length)
    return {
      data: current,
      remaining,
      error: `Review ${remaining.length} unconfirmed moves before retrying. Source categories were kept. ${failures.join(" ")}`,
    };
  try {
    return { data: await save(current, settings), remaining: [] };
  } catch (error) {
    return {
      data: current,
      remaining: [],
      error: `The items were moved, but the category changes couldn’t be saved. ${(error as Error).message}`,
    };
  }
}

export function createCategorySettingsSaver(
  send: (path: string, body?: unknown) => Promise<unknown>,
  load: () => Promise<Workspace>,
): SaveCategories {
  const save = createSettingsSaver(send, load);
  return (before, settings, moves) =>
    saveCategorySettings(before, settings, moves, save, async (request) => {
      try {
        const response = (await send("/api/admin/bulk", request)) as {
          results: BulkResult[];
        };
        return { data: await load(), results: response.results };
      } catch (error) {
        const latest = await load();
        const results: BulkResult[] = await Promise.all(
          request.items.map(async ({ id }) => {
            const draft = latest.content.find((item) => item.id === id);
            let publishedMatches = !draft?.publishedRevision;
            if (
              draft &&
              draft.category === request.value &&
              draft.publishedRevision
            ) {
              try {
                const published = (await send(
                  `/api/content?id=${encodeURIComponent(id)}&snapshot=published`,
                )) as Content;
                publishedMatches = published.category === request.value;
              } catch {
                publishedMatches = false;
              }
            }
            return draft?.category === request.value && publishedMatches
              ? { id, status: "unchanged" }
              : {
                  id,
                  status: "failed",
                  message: `This move couldn’t be confirmed. Refresh and review before retrying. ${(error as Error).message}`,
                };
          }),
        );
        return { data: latest, results };
      }
    });
}
