import "server-only";
import type { User, Content } from "@/lib/types";
import { db, check } from "./db";
import { canRead } from "./content";
import { HttpError } from "./auth";
import { progressSchema } from "./schemas";
import { gradeQuiz, quizUnlocked } from "@/lib/course-quiz";
import type { Progress } from "@/lib/types";

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
  let priorCompleted = false;
  let priorAttempts: NonNullable<Progress["attempts"]> = [];
  if (user) {
    const { data: p, error: e } = await db()
      .from("fb_progress")
      .select("lessons,passed,attempts")
      .eq("user_id", user.id)
      .eq("content_id", c.id)
      .eq("version", c.version)
      .maybeSingle();
    check(e);
    prior = p?.lessons || [];
    priorCompleted = !!p?.passed;
    priorAttempts = p?.attempts || [];
  }
  const allDone = c.lessons.every(
    (l) => lessons.includes(l.id) || prior.includes(l.id),
  );
  const selections = a.selections || a.answers?.map((answer) => [answer]);
  const attempted = !!selections;
  if (attempted && !allDone)
    throw new HttpError(
      400,
      "Complete the lessons before submitting the quiz.",
    );
  let attempt: NonNullable<Progress["attempts"]>[number] | undefined;
  if (attempted) {
    if (!c.questions.length) throw new HttpError(400, "This course has no quiz.");
    let graded: ReturnType<typeof gradeQuiz>;
    try { graded = gradeQuiz(c, selections!); }
    catch (error) { throw new HttpError(400, (error as Error).message); }
    attempt = {
      at: new Date().toISOString(), version: c.version,
      passed: graded.passed, answers: graded.answers,
    };
  }
  if (a.complete && (!allDone || !quizUnlocked(c, [...priorAttempts, ...(attempt ? [attempt] : [])])))
    throw new HttpError(400, "Finish the lessons and quiz before completing this course.");
  const completed = priorCompleted || !!a.complete;
  if (!user)
    return { lessons, passed: completed, attemptPassed: attempt?.passed,
      attempt, attempts: attempt ? [attempt] : [] };
  const { data: p, error: e } = await db().rpc("fb_record_progress", {
    p_user: user.id,
    p_content: c.id,
    p_version: c.version,
    p_lessons: lessons,
    p_passed: completed,
    p_attempt: attempt || null,
  });
  check(e);
  return { ...p, attemptPassed: attempt?.passed, attempt };
}
