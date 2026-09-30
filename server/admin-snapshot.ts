import "server-only";
import { db, check } from "./db";
import { readAll } from "./read-all";
import { document, readConfig } from "./content";
import { profile, requireAdmin } from "./auth";
import type { Workspace } from "@/lib/store";
import type { Content, User } from "@/lib/types";

export type AdminScope = "content" | "governance" | "feedback";

const contentIndex = async (): Promise<Content[]> => {
  const rows = await readAll((from, to) =>
    db()
      .from("fb_documents")
      .select(
        "id,revision,published_revision,updated_at,title:draft->>title,summary:draft->>summary,category:draft->>category,folder:draft->>folder,sectionId:draft->>sectionId,sectionOrder:draft->sectionOrder,kind:draft->>kind,status:draft->>status,version:draft->>version,createdAt:draft->>createdAt,feedAt:draft->>feedAt,cardArt:draft->cardArt,groups:draft->groups,assignments:draft->assignments,duration:draft->>duration,coverImageUrl:draft->>coverImageUrl",
        { count: "exact" },
      )
      .is("deleted_at", null)
      .order("id")
      .range(from, to),
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title || "",
    summary: row.summary || "",
    category: row.category || "",
    folder: row.folder || "",
    sectionId: row.sectionId || undefined,
    sectionOrder: row.sectionOrder ? Number(row.sectionOrder) : undefined,
    kind: row.kind,
    status: row.status,
    version: Number(row.version) || 1,
    createdAt: row.createdAt || row.updated_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    publishedRevision: row.published_revision || undefined,
    groups: row.groups || [],
    assignments: row.assignments || [],
    duration: Number(row.duration) || 5,
    coverImageUrl: row.coverImageUrl || undefined,
    cardArt: row.cardArt || undefined,
    feedAt: row.feedAt || undefined,
    body: "",
    lessons: [],
    questions: [],
  })) as unknown as Content[];
};

/** Only administrator data crosses this boundary. Never cache it. */
export async function adminSnapshot(
  user: User,
  scope: AdminScope,
): Promise<Workspace> {
  requireAdmin(user);
  const [config, content] = await Promise.all([readConfig(), contentIndex()]);
  const data: Workspace = {
    schema: 1,
    settings: config.settings,
    revision: config.revision,
    governanceRevision: config.governance_revision,
    content,
    publishedContent: content
      .filter((item) => item.publishedRevision)
      .map((item) => ({
        ...item,
        status: "published" as const,
        revision: item.publishedRevision ?? undefined,
      })),
    users: [user],
    groups: config.groups || [],
    curricula: config.curricula || [],
    teams: [],
    pendingUsers: [],
    progress: {},
    feedback: [],
  };
  const deleted = await readAll((from, to) =>
    db()
      .from("fb_deleted_items")
      .select(
        "entity,id,name,kind,revision,deleted_at,purge_after,deleted_by,purging,error",
        { count: "exact" },
      )
      .order("id")
      .order("entity")
      .range(from, to),
  );
  const actors = [...new Set(deleted.map((d) => d.deleted_by))];
  const { data: names, error: namesError } = actors.length
    ? await db().from("fb_profiles").select("id,name").in("id", actors)
    : { data: [], error: null };
  check(namesError);
  data.deletedItems = deleted.map((d) => ({
    id: d.id,
    entity: d.entity,
    name: d.name,
    kind: d.kind,
    revision: d.revision,
    deletedAt: d.deleted_at,
    purgeAfter: d.purge_after,
    deletedBy:
      names?.find((p) => p.id === d.deleted_by)?.name || "Former administrator",
    purging: d.purging,
    error: d.error || undefined,
  }));
  const { data: cleanup, error: cleanupError } = await db()
    .from("fb_cleanup_config")
    .select("endpoint,last_run")
    .eq("id", true)
    .single();
  check(cleanupError);
  data.cleanupStatus = {
    configured: !!cleanup?.endpoint,
    lastRun: cleanup?.last_run || undefined,
  };
  if (scope === "content") return data;

  if (scope === "feedback") {
    const [ratings, people] = await Promise.all([
      readAll((from, to) =>
        db()
          .from("fb_feedback")
          .select("*", { count: "exact" })
          .order("id")
          .range(from, to),
      ),
      readAll((from, to) =>
        db()
          .from("fb_profiles")
          .select("*", { count: "exact" })
          .order("id")
          .range(from, to),
      ),
    ]);
    data.users = people.filter((p) => !p.deleted_at).map(profile);
    data.feedback = ratings.map((row) => ({
      id: row.id,
      userId: row.user_id || "guest",
      contentId: row.content_id || undefined,
      version: row.version ?? undefined,
      rating: row.rating,
      comment: row.comment,
      updatedAt: row.updated_at,
    }));
    return data;
  }

  const [governanceResult, courseRows] = await Promise.all([
    db().rpc("fb_governance_snapshot", { p_actor: user.id }),
    readAll((from, to) =>
      db()
        .from("fb_documents")
        .select("id,draft,published,revision,published_revision,updated_at", {
          count: "exact",
        })
        .is("deleted_at", null)
        .eq("draft->>kind", "course")
        .order("id")
        .range(from, to),
    ),
  ]);
  check(governanceResult.error);
  const governance = governanceResult.data;
  const current = governance.users.find((entry: any) => entry.id === user.id);
  if (!current || !current.active || current.role !== "admin")
    throw new Error("Account access changed. Reload and sign in again.");
  data.users = governance.users.map(profile);
  data.groups = governance.groups;
  data.teams = governance.teams;
  data.governanceRevision = governance.revision;
  data.pendingUsers = governance.pending.map((entry: any) => ({
    email: entry.email,
    name: entry.name,
    role: entry.role,
    groups: entry.groups,
    teamId: entry.team_id || undefined,
    onboardingStart: entry.onboarding_start || undefined,
  }));
  for (const progress of governance.progress)
    (data.progress[progress.user_id] ??= []).push({
      content_id: progress.content_id,
      version: progress.version,
      lessons: progress.lessons,
      passed: progress.passed,
      attempts: progress.attempts,
      revision: progress.revision,
    });
  const courses = new Map(courseRows.map((row) => [row.id, row]));
  data.content = content.map((item) => {
    const row = courses.get(item.id);
    return row ? document(row, true) : item;
  });
  data.publishedContent = courseRows
    .filter((row) => row.published)
    .map((row) => document(row));
  return data;
}
