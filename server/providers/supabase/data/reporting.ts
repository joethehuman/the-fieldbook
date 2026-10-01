import "server-only";
import type {
  DataStore,
  DocumentRecord,
  FeedbackRecord,
  ProgressRecord,
} from "../../../ports/data";
import { db, check } from "../client";
import { readAll } from "../read-all";
import { contentDate } from "@/lib/search";

export const reportingData: Pick<
  DataStore,
  "readReportInputs" | "searchPublished"
> = {
  async readReportInputs() {
    const [progress, feedback, documents] = await Promise.all([
      readAll<ProgressRecord>((from, to) =>
        db()
          .from("fb_progress")
          .select("user_id,content_id,version,passed,lessons,attempts", {
            count: "exact",
          })
          .order("user_id")
          .order("content_id")
          .order("version")
          .range(from, to),
      ),
      readAll<Pick<FeedbackRecord, "id" | "content_id" | "rating">>(
        (from, to) =>
          db()
            .from("fb_feedback")
            .select("id,content_id,rating", { count: "exact" })
            .order("id")
            .range(from, to),
      ),
      readAll<Pick<DocumentRecord, "id" | "published">>((from, to) =>
        db()
          .from("fb_documents")
          .select("id,published", { count: "exact" })
          .order("id")
          .range(from, to),
      ),
    ]);
    return { progress, feedback, documents };
  },
  async searchPublished(query, kind) {
    const { data, error } = await db().rpc("fb_search", {
      p_query: query,
      p_kind: kind,
      p_limit: 31,
    });
    check(error);
    return (data || []).map(
      (r: {
        content_id: string;
        passage_id: string;
        kind: "doc" | "brief" | "course";
        title: string;
        lesson_id?: string;
        lesson_title?: string;
        source_text: string;
        matched_terms: string[];
        published_revision: number;
        content_date: string;
      }) => ({
        contentId: r.content_id,
        passageId: r.passage_id,
        kind: r.kind,
        title: r.title,
        lessonId: r.lesson_id,
        lessonTitle: r.lesson_title,
        text: r.source_text,
        matchedTerms: r.matched_terms,
        publishedRevision: r.published_revision,
        contentDate: contentDate(r.content_date),
      }),
    );
  },
};
