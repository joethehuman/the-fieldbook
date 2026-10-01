import "server-only";
import type { Content } from "@/lib/types";
import type {
  DataStore,
  DocumentRecord,
  WorkspaceDocumentRecord,
  DraftIndexRecord,
  ReaderIndexRecord,
  CourseIndexRecord,
} from "../../../ports/data";
import { db, check } from "../client";
import { readAll } from "../read-all";
import { HttpError } from "../../../errors";

export const contentData: Pick<
  DataStore,
  | "findDocument"
  | "readPublishedCourse"
  | "readPublishedBody"
  | "saveDocument"
  | "listWorkspaceDocuments"
  | "listDocumentPlacements"
  | "listDraftIndex"
  | "listDraftCourses"
  | "listPublishedReaderIndex"
  | "listPublishedCourseIndex"
  | "listRecentMcpDocuments"
  | "findReadyMedia"
  | "findCurriculumArtwork"
  | "listReadyMcpMedia"
> = {
  async findDocument(id) {
    const { data, error } = await db()
      .from("fb_documents")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    check(error);
    return data as DocumentRecord | null;
  },
  async readPublishedCourse(id) {
    const { data, error } = await db()
      .from("fb_documents")
      .select("published")
      .eq("id", id)
      .maybeSingle();
    check(error);
    return (data?.published ?? null) as Content | null;
  },
  async readPublishedBody(id) {
    const { data, error } = await db()
      .from("fb_documents")
      .select("id,published,published_revision")
      .eq("id", id)
      .maybeSingle();
    check(error);
    return data as Pick<
      DocumentRecord,
      "id" | "published" | "published_revision"
    > | null;
  },
  async saveDocument(write) {
    const { data, error } = await db().rpc("fb_save_document", {
      p_id: write.id,
      p_expected: write.expected,
      p_draft: write.draft,
      p_publish: write.publish,
      p_unpublish: write.unpublish,
      p_actor: write.actorId,
      p_source: write.source,
    });
    if (error?.code === "P0001")
      throw new HttpError(
        error.message.includes("Revision conflict") ? 409 : 400,
        error.message,
      );
    check(error);
    return data as DocumentRecord;
  },
  async listWorkspaceDocuments(includeDrafts) {
    return await readAll<WorkspaceDocumentRecord>((from, to) => {
      const query = includeDrafts
        ? db()
            .from("fb_documents")
            .select("*", { count: "exact" })
            .is("deleted_at", null)
        : db()
            .from("fb_documents")
            .select("id,published,revision,published_revision,updated_at", {
              count: "exact",
            })
            .not("published", "is", null);
      return query
        .order("id")
        .range(from, to)
        .returns<WorkspaceDocumentRecord[]>();
    });
  },
  async listDocumentPlacements() {
    return await readAll<Pick<DocumentRecord, "id" | "draft" | "published">>(
      (from, to) =>
        db()
          .from("fb_documents")
          .select("id,draft,published", { count: "exact" })
          .order("id")
          .range(from, to),
    );
  },
  async listDraftIndex() {
    return await readAll<DraftIndexRecord>((from, to) =>
      db()
        .from("fb_documents")
        .select(
          "id,revision,published_revision,updated_at,title:draft->>title,summary:draft->>summary,category:draft->>category,folder:draft->>folder,sectionId:draft->>sectionId,sectionOrder:draft->sectionOrder,kind:draft->>kind,status:draft->>status,version:draft->>version,createdAt:draft->>createdAt,feedAt:draft->>feedAt,cardArt:draft->cardArt,groups:draft->groups,assignments:draft->assignments,duration:draft->>duration,coverImageUrl:draft->>coverImageUrl",
          { count: "exact" },
        )
        .is("deleted_at", null)
        .order("id")
        .range(from, to)
        .returns<DraftIndexRecord[]>(),
    );
  },
  async listDraftCourses() {
    return await readAll<DocumentRecord>((from, to) =>
      db()
        .from("fb_documents")
        .select("id,draft,published,revision,published_revision,updated_at", {
          count: "exact",
        })
        .is("deleted_at", null)
        .eq("draft->>kind", "course")
        .order("id")
        .range(from, to),
    );
  },
  async listPublishedReaderIndex() {
    return await readAll<ReaderIndexRecord>((from, to) =>
      db()
        .from("fb_documents")
        .select(
          "id,title:published->>title,summary:published->>summary,category:published->>category,folder:published->>folder,sectionId:published->>sectionId,sectionOrder:published->sectionOrder,kind:published->>kind,status:published->>status,createdAt:published->>createdAt,updatedAt:published->>updatedAt,feedAt:published->>feedAt,cardArt:published->cardArt,groups:published->groups",
          { count: "exact" },
        )
        .not("published", "is", null)
        .order("id")
        .range(from, to)
        .returns<ReaderIndexRecord[]>(),
    );
  },
  async listPublishedCourseIndex() {
    return await readAll<CourseIndexRecord>((from, to) =>
      db()
        .from("fb_documents")
        .select(
          "id,title:published->>title,summary:published->>summary,category:published->>category,folder:published->>folder,kind:published->>kind,status:published->>status,createdAt:published->>createdAt,updatedAt:published->>updatedAt,cardArt:published->cardArt,groups:published->groups,assignments:published->assignments,coverImageUrl:published->>coverImageUrl,duration:published->>duration,version:published->>version,lessons:published->lessons,questions:published->questions",
          { count: "exact" },
        )
        .not("published", "is", null)
        .eq("published->>kind", "course")
        .order("id")
        .range(from, to)
        .returns<CourseIndexRecord[]>(),
    );
  },
  async listRecentMcpDocuments() {
    const { data, error } = await db()
      .from("fb_documents")
      .select("*")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(500);
    check(error);
    return (data || []) as DocumentRecord[];
  },
  async findReadyMedia(ids) {
    const { data, error } = await db()
      .from("fb_media")
      .select("id,mime")
      .in("id", ids)
      .eq("ready", true);
    check(error);
    return (data || []) as { id: string; mime: string }[];
  },
  async findCurriculumArtwork(ids) {
    const { data, error } = await db()
      .from("fb_media")
      .select("id,mime")
      .in("id", ids)
      .eq("ready", true);
    // Preserve governance's generic failure response without exporting an SDK error.
    if (error) throw new Error("Curriculum artwork lookup failed.");
    return (data || []) as { id: string; mime: string }[];
  },
  async listReadyMcpMedia() {
    const { data, error } = await db()
      .from("fb_media")
      .select("id,path,filename,mime,bytes")
      .eq("ready", true)
      .order("created_at", { ascending: false })
      .limit(100);
    check(error);
    return (data || []) as {
      id: string;
      filename: string;
      mime: string;
      bytes: number;
      path: string;
    }[];
  },
};
