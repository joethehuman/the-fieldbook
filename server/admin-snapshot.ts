import "server-only";
import { data as dataStore } from "./data";
import { document, readConfig } from "./content";
import { profile, requireAdmin } from "./auth";
import type { Workspace } from "@/lib/store";
import type { Content, User } from "@/lib/types";

import type { AdminScope } from "@/lib/admin-scope";
export type { AdminScope } from "@/lib/admin-scope";

const contentIndex = async (): Promise<Content[]> => {
  const rows = await dataStore().listDraftIndex();
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
  userId?: string,
): Promise<Workspace> {
  requireAdmin(user);
  const store = dataStore();
  const reports = scope === "governance" || scope === "person";
  // Start independent reads together after the request-time administrator check.
  // Housekeeping cannot delay or fail an unrelated account/content list.
  const [config, content, governance, courseRows, feedback, maintenance] =
    await Promise.all([
      readConfig(),
      contentIndex(),
      scope === "people" || scope === "person"
        ? store.readAdminPeopleSnapshot(user.id, userId)
        : scope === "governance"
          ? store.readGovernanceSnapshot(user.id)
          : null,
      reports ? store.listDraftCourses() : [],
      scope === "feedback"
        ? Promise.all([store.listFeedback(), store.listProfiles()])
        : null,
      scope === "maintenance"
        ? Promise.all([
            store.listDeletedItems().then(async (deleted) => ({
              deleted,
              names: await store.readProfileNames([
                ...new Set(deleted.map((d) => d.deleted_by)),
              ]),
            })),
            store.readCleanupStatus(),
          ])
        : null,
    ]);
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
  if (maintenance) {
    const [{ deleted, names }, cleanup] = maintenance;
    data.deletedItems = deleted.map((d) => ({
      id: d.id,
      entity: d.entity,
      name: d.name,
      kind: d.kind,
      revision: d.revision,
      deletedAt: d.deleted_at,
      purgeAfter: d.purge_after,
      deletedBy:
        names.find((p) => p.id === d.deleted_by)?.name ||
        "Former administrator",
      purging: d.purging,
      error: d.error || undefined,
    }));
    data.cleanupStatus = {
      configured: !!cleanup?.endpoint,
      lastRun: cleanup?.last_run || undefined,
    };
  }
  if (feedback) {
    const [ratings, people] = feedback;
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
  }
  if (!governance) return data;
  const current = governance.users.find((entry: any) => entry.id === user.id);
  if (!current || !current.active || current.role !== "admin")
    throw new Error("Account access changed. Reload and sign in again.");
  data.users = governance.users.map(profile);
  data.groups = governance.groups;
  if (governance.curricula) data.curricula = governance.curricula;
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
  if (!reports) return data;
  if (scope === "person" && !data.users.some((person) => person.id === userId))
    throw new Error(
      "This person is no longer available. Refresh the People list.",
    );
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
