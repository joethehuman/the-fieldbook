import "server-only";
import type { User, Content } from "@/lib/types";
import { db, check } from "./db";
import { canRead } from "./content";
import { HttpError } from "./auth";
import { progressSchema } from "./schemas";

export async function recordProgress(user: User | null, input: unknown) {
  await canRead(user);
  const parsed = progressSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Invalid progress request.");
  const a = parsed.data;
  const { data, error } = await db()
    .from("fb_documents")
    .select("published")
    .eq("id", a.contentId)
    .maybeSingle();
  check(error);
  const c = data?.published as Content | undefined;
  if (!c || c.kind !== "course") throw new HttpError(404, "Course not found.");
  if (c.version !== a.version)
    throw new HttpError(
      409,
      "This course has a new version. Reload to continue.",
    );
  const lessons = [
    ...new Set([...(a.lessons || []), ...(a.lessonId ? [a.lessonId] : [])]),
  ].filter((id) => c.lessons.some((l) => l.id === id));
  let prior: string[] = [];
  if (user) {
    const { data: p, error: e } = await db()
      .from("fb_progress")
      .select("lessons")
      .eq("user_id", user.id)
      .eq("content_id", c.id)
      .eq("version", c.version)
      .maybeSingle();
    check(e);
    prior = p?.lessons || [];
  }
  const allDone = c.lessons.every(
    (l) => lessons.includes(l.id) || prior.includes(l.id),
  );
  const attempted = !!a.answers;
  if (attempted && !allDone)
    throw new HttpError(
      400,
      "Complete the lessons before submitting the quiz.",
    );
  const passed =
    c.questions.length === 0 ||
    (attempted &&
      a.answers!.length === c.questions.length &&
      c.questions.every((q, i) => q.answer === a.answers![i]));
  if (!user)
    return { lessons, passed, attemptPassed: attempted ? passed : undefined };
  const { data: p, error: e } = await db().rpc("fb_record_progress", {
    p_user: user.id,
    p_content: c.id,
    p_version: c.version,
    p_lessons: lessons,
    p_passed: passed,
    p_attempt: attempted ? { at: new Date().toISOString(), passed } : null,
  });
  check(e);
  return { ...p, attemptPassed: attempted ? passed : undefined };
}
