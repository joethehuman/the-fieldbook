import "server-only";
import type { Content, User } from "@/lib/types";
import { courseProgress } from "@/lib/course-progress";
import { requireAdmin } from "./auth";
import { db } from "./db";
import { readAll } from "./read-all";

export async function contentReport(user: User | null) {
  requireAdmin(user);
  const [progress, feedback, documents] = await Promise.all([
    readAll((from, to) =>
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
    readAll((from, to) =>
      db()
        .from("fb_feedback")
        .select("id,content_id,rating", { count: "exact" })
        .order("id")
        .range(from, to),
    ),
    readAll((from, to) =>
      db()
        .from("fb_documents")
        .select("id,published", { count: "exact" })
        .order("id")
        .range(from, to),
    ),
  ]);
  const courses = documents.filter((d) => d.published?.kind === "course");
  const counts = new Map(
    courses.map((d) => [d.id, { started: 0, completed: 0 }]),
  );
  const byId = new Map(
    courses.map((d) => [d.id, { ...d.published, id: d.id } as Content]),
  );
  for (const record of progress) {
    const course = byId.get(record.content_id);
    if (!course || record.version !== course.version) continue;
    const status = courseProgress(course, [record]);
    const count = counts.get(record.content_id)!;
    if (status.started) count.started++;
    if (status.complete) count.completed++;
  }
  const ratings = new Map<string, { positive: number; negative: number }>();
  for (const row of feedback) {
    if (!row.content_id) continue;
    const count = ratings.get(row.content_id) || { positive: 0, negative: 0 };
    if (row.rating === "up") count.positive++;
    if (row.rating === "down") count.negative++;
    ratings.set(row.content_id, count);
  }
  return {
    courses: courses.map((d) => ({
      id: d.id,
      title: d.published.title,
      version: d.published.version,
      ...counts.get(d.id)!,
    })),
    feedback: documents.map((d) => ({
      id: d.id,
      ...(ratings.get(d.id) || { positive: 0, negative: 0 }),
    })),
    complete: true,
  };
}
