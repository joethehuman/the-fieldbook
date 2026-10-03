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
import { HttpError } from "../../../errors";
import type {
  LearningReportPage,
  ReportPage,
  FeedbackReportRow,
  ReportingScopes,
} from "../../../ports/mcp-reporting";

function reportError(error: { message: string; code?: string } | null) {
  if (error?.code === "42501")
    throw new HttpError(
      403,
      "These reporting filters are outside your current access. Refresh the available reporting scopes.",
    );
  if (error?.code === "40001")
    throw new HttpError(
      409,
      "This report changed during pagination. Start the report again to export a consistent result.",
    );
  if (error?.code === "22023")
    throw new HttpError(
      400,
      "Invalid reporting filters. Refresh the available reporting scopes.",
    );
  check(error);
}

export const reportingData: Pick<
  DataStore,
  | "readReportInputs"
  | "readProgressReport"
  | "searchPublished"
  | "readMcpReportingScopes"
  | "readMcpLearningReport"
  | "readMcpFeedbackReport"
> = {
  async readProgressReport(actorId, personId) {
    const { data, error } = await db().rpc("fb_progress_report", {
      p_actor: actorId,
      p_person: personId || null,
    });
    reportError(error);
    return data as import("../../../progress-report").ProgressReportRecord;
  },
  async readMcpReportingScopes(actorId) {
    const { data, error } = await db().rpc("fb_mcp_reporting_scopes", {
      p_actor: actorId,
    });
    reportError(error);
    return data as ReportingScopes;
  },
  async readMcpLearningReport(actorId, input, after, expectedFingerprint) {
    const { data, error } = await db().rpc("fb_mcp_learning_report", {
      p_actor: actorId,
      p_input: input,
      p_after_person: after?.personId || null,
      p_after_course: after?.courseId || null,
      p_expected_fingerprint: expectedFingerprint,
    });
    reportError(error);
    return data as LearningReportPage;
  },
  async readMcpFeedbackReport(actorId, input, afterId, expectedFingerprint) {
    const { data, error } = await db().rpc("fb_mcp_feedback_report", {
      p_actor: actorId,
      p_input: input,
      p_after: afterId,
      p_expected_fingerprint: expectedFingerprint,
    });
    reportError(error);
    return data as ReportPage<FeedbackReportRow>;
  },
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
