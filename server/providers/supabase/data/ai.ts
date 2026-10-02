import "server-only";
import { z } from "zod";
import type { DataStore } from "../../../ports/data";
import { contentDate } from "@/lib/search";
import { db, check } from "../client";
import { HttpError } from "../../../errors";

const passageSchema = z.object({
  content_id: z.uuid(),
  passage_id: z.string(),
  kind: z.enum(["doc", "brief", "course"]),
  title: z.string(),
  lesson_id: z.string().nullable(),
  lesson_title: z.string().nullable(),
  source_text: z.string().max(20_000),
  published_revision: z.number().int(),
  content_date: z.string().nullable(),
});
function aiCheck(error: Parameters<typeof check>[0]) {
  if (error && ["42883", "PGRST202"].includes(error.code || ""))
    throw new HttpError(
      503,
      "Ask AI retrieval setup is incomplete. Apply the Ask AI migration before enabling it.",
    );
  check(error);
}
export const aiData: Pick<
  DataStore,
  "searchAiPassages" | "areAiSourcesCurrent"
> = {
  async searchAiPassages(queries, kinds, signal) {
    const query = db().rpc("fb_ai_passages", {
      p_queries: queries,
      p_kinds: kinds,
      p_limit: 12,
    });
    const { data, error } = await (signal ? query.abortSignal(signal) : query);
    aiCheck(error);
    const parsed = z.array(passageSchema).max(12).safeParse(data);
    if (!parsed.success)
      throw new HttpError(
        503,
        "Ask AI retrieval returned an invalid response.",
      );
    return parsed.data.map((row) => ({
      contentId: row.content_id,
      passageId: row.passage_id,
      kind: row.kind,
      title: row.title,
      lessonId: row.lesson_id,
      lessonTitle: row.lesson_title,
      text: row.source_text,
      publishedRevision: row.published_revision,
      contentDate: contentDate(row.content_date || undefined),
    }));
  },
  async areAiSourcesCurrent(sources, signal) {
    const query = db().rpc("fb_ai_sources_current", {
      p_sources: sources.map((source) => ({
        content_id: source.contentId,
        passage_id: source.passageId,
        published_revision: source.publishedRevision,
      })),
    });
    const { data, error } = await (signal ? query.abortSignal(signal) : query);
    aiCheck(error);
    if (typeof data !== "boolean")
      throw new HttpError(503, "Ask AI source verification is unavailable.");
    return data;
  },
};
