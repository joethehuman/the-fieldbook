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
  const config = await canRead(user),
    admin = user?.role === "admin";
  const documents = await db()
    .from("fb_documents")
    .select("*")
    .order("updated_at", { ascending: false });
  check(documents.error);
  const published = (documents.data || [])
    .filter((r) => r.published)
    .map((r) => redact(document(r)));
  let users = [user || guest],
    progress: Workspace["progress"] = {},
    feedback: NonNullable<Workspace["feedback"]> = [];
  if (user) {
    const [people, learning, ratings] = await Promise.all([
      admin
        ? db().from("fb_profiles").select("*")
        : Promise.resolve({ data: null, error: null }),
      admin
        ? db().from("fb_progress").select("*")
        : db().from("fb_progress").select("*").eq("user_id", user.id),
      admin
        ? db().from("fb_feedback").select("*")
        : db().from("fb_feedback").select("*").eq("user_id", user.id),
    ]);
    check(people.error);
    check(learning.error);
    check(ratings.error);
    if (people.data) users = people.data.map(profile);
    for (const p of learning.data || [])
      (progress[p.user_id] ??= []).push({
        content_id: p.content_id,
        version: p.version,
        lessons: p.lessons,
        passed: p.passed,
        attempts: p.attempts,
      });
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
  return {
    schema: 1,
    settings: admin ? config.settings : publicSettings(config.settings),
    revision: config.revision,
    content: admin
      ? (documents.data || []).map((r) => document(r, true))
      : published,
    publishedContent: published,
    users,
    progress,
    feedback,
    groups: admin ? config.groups : [],
    teams: admin ? config.teams : [],
  };
}
