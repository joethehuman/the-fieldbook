import "server-only";
import { publicSettings } from "@/lib/settings";
import { db, check } from "./db";
import { readAll } from "./read-all";
import { profile } from "./auth";
import { canRead, document, redact } from "./content";
import type { User } from "@/lib/types";
import type { Workspace } from "@/lib/store";

import { guest, guestRecommendations } from "@/lib/guest-recommendations";
export { guest };
export async function snapshot(user: User | null): Promise<Workspace> {
  const config = await canRead(user);
  let admin = false;
  let users = [user || guest],
    progress: Workspace["progress"] = {},
    feedback: NonNullable<Workspace["feedback"]> = [],
    governance: any = { groups: [], teams: [], pending: [] };
  if (user) {
    const result = await db().rpc("fb_governance_snapshot", {
      p_actor: user.id,
    });
    check(result.error);
    governance = result.data;
    if (!governance.users.some((u: any) => u.id === user.id))
      throw new Error("Account access changed. Reload and sign in again.");
    users = governance.users.map(profile);
    admin = users.find((u) => u.id === user.id)?.role === "admin";
    for (const p of governance.progress)
      (progress[p.user_id] ??= []).push({
        content_id: p.content_id,
        version: p.version,
        lessons: p.lessons,
        passed: p.passed,
        attempts: p.attempts,
        revision: p.revision,
      });
    const ratings = await readAll((from, to) => {
      let query = db().from("fb_feedback").select("*", { count: "exact" });
      if (!admin) query = query.eq("user_id", user.id);
      return query.order("id").range(from, to);
    });
    feedback = ratings.map((r) => ({
      id: r.id,
      userId: r.user_id || "guest",
      contentId: r.content_id,
      version: r.version,
      rating: r.rating,
      comment: r.comment,
      updatedAt: r.updated_at,
    }));
  }
  const documents = await readAll((from, to) => {
    const query = admin
      ? db().from("fb_documents").select("*", { count: "exact" })
      : db()
          .from("fb_documents")
          .select("id,published,revision,published_revision,updated_at", {
            count: "exact",
          })
          .not("published", "is", null);
    return query.order("id").range(from, to);
  });
  // Keep catalog presentation order, with a deterministic tie-breaker.
  documents.sort(
    (a, b) =>
      b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id),
  );
  if (!user) {
    const projected = guestRecommendations({
      settings: config.settings,
      groups: config.groups || [],
      curricula: config.curricula || [],
      content: documents
        .filter((r) => r.published)
        .map((r) => {
          const c = document(r);
          return { ...redact(c), groups: c.groups, assignments: c.assignments };
        }),
    });
    return {
      schema: 1,
      settings: projected.settings,
      content: projected.content,
      publishedContent: projected.content,
      users: [projected.user],
      groups: projected.groups,
      curricula: projected.curricula,
      progress: {},
      feedback: [],
      teams: [],
      pendingUsers: [],
    };
  }
  // Include only assignment rules relevant to the server-authorized people.
  // This affects assignment metadata, never the published content catalog.
  const groupIds = new Set(governance.groups.map((g: any) => g.id));
  const learningContent = documents
    .filter((r) => r.published)
    .map((r) => {
      const c = document(r);
      return {
        ...redact(c),
        groups: c.groups.filter((g) => groupIds.has(g)),
        assignments: c.assignments?.filter(
          (a) =>
            (a.groupId && groupIds.has(a.groupId)) ||
            (a.userId && users.some((u) => u.id === a.userId)),
        ),
      };
    });
  return {
    schema: 1,
    settings: admin ? config.settings : publicSettings(config.settings, learningContent),
    revision: config.revision,
    content: admin ? documents.map((r) => document(r, true)) : learningContent,
    publishedContent: learningContent,
    users,
    progress,
    feedback,
    groups: governance.groups,
    curricula: (config.curricula || [])
      .filter((c: any) => admin || c.status === "published")
      .map((c: any) =>
        admin
          ? c
          : {
              ...c,
              courseIds: c.courseIds.filter((id: string) =>
                learningContent.some((d) => d.id === id && d.kind === "course"),
              ),
            },
      ),
    teams: governance.teams,
    governanceRevision: admin ? governance.revision : undefined,
    pendingUsers: governance.pending.map((p: any) => ({
      email: p.email,
      name: p.name,
      role: p.role,
      groups: p.groups,
      teamId: p.team_id || undefined,
      onboardingStart: p.onboarding_start || undefined,
    })),
  };
}
