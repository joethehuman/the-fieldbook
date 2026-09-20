import "server-only";
import { publicSettings } from "@/lib/settings";
import { db, check } from "./db";
import { profile } from "./auth";
import { canRead, document, redact } from "./content";
import type { User } from "@/lib/types";
import type { Workspace } from "@/lib/store";

export const guest: User = {
  id: "guest",
  name: "Guest",
  email: "",
  role: "learner",
  groups: [],
  active: true,
};
export async function snapshot(user: User | null): Promise<Workspace> {
  const config = await canRead(user);
  let admin = false;
  const documents = await db()
    .from("fb_documents")
    .select("*")
    .order("updated_at", { ascending: false });
  check(documents.error);
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
    const ratings = admin
      ? await db().from("fb_feedback").select("*")
      : await db().from("fb_feedback").select("*").eq("user_id", user.id);
    check(ratings.error);
    feedback = (ratings.data || []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      contentId: r.content_id,
      version: r.version,
      rating: r.rating,
      comment: r.comment,
      updatedAt: r.updated_at,
    }));
  }
  // Include only assignment rules relevant to the server-authorized people.
  // This affects assignment metadata, never the published content catalog.
  const groupIds = new Set(governance.groups.map((g: any) => g.id));
  const learningContent = (documents.data || [])
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
    settings: admin ? config.settings : publicSettings(config.settings),
    revision: config.revision,
    content: admin
      ? (documents.data || []).map((r) => document(r, true))
      : learningContent,
    publishedContent: learningContent,
    users,
    progress,
    feedback,
    groups: governance.groups,
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
