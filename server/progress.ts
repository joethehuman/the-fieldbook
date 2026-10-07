import "server-only";
import type { User } from "@/lib/types";
import { data as dataStore } from "./data";
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
  if (a.guestImport && !user)
    throw new HttpError(401, "Sign in to save browser progress.");
  const c = await dataStore().readPublishedCourse(a.contentId);
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
    const p = await dataStore().readCourseProgress(user.id, c.id, c.version);
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
    if (!c.questions.length)
      throw new HttpError(400, "This course has no quiz.");
    let graded: ReturnType<typeof gradeQuiz>;
    try {
      graded = gradeQuiz(c, selections!);
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
    attempt = {
      at: new Date().toISOString(),
      version: c.version,
      passed: graded.passed,
      answers: graded.answers,
    };
  }
  const unlocked = quizUnlocked(c, [
    ...priorAttempts,
    ...(attempt ? [attempt] : []),
  ]);
  if (a.complete && (!allDone || (!unlocked && !attempt)))
    throw new HttpError(
      400,
      "Finish the lessons and quiz before completing this course.",
    );
  // A failed required attempt is recorded and returned to the learner, without completion.
  const completed = priorCompleted || (!!a.complete && unlocked);
  if (!user)
    return {
      lessons,
      passed: completed,
      attemptPassed: attempt?.passed,
      attempt,
      attempts: attempt ? [attempt] : [],
    };
  const p = await dataStore().mergeProgress(
    user.id,
    c.id,
    c.version,
    lessons,
    completed,
    attempt || null,
  );
  return { ...p, attemptPassed: attempt?.passed, attempt };
}
