import "server-only";
import { createHash } from "node:crypto";
import type { Content, User } from "@/lib/types";
import { courseProgress } from "@/lib/course-progress";
import { learningTarget } from "@/lib/learning";
import { defaultSettings } from "@/lib/settings";
import {
  learningReportInputSchema,
  feedbackReportInputSchema,
} from "@/lib/mcp-report-schema";
import type { LearningReportProjection } from "./ports/mcp-reporting";
import { requirePublisher } from "./auth";
import { HttpError } from "./errors";
import { data as dataStore } from "./data";

function requireReporting(user: User | null): asserts user is User {
  if (!user) throw new HttpError(401, "Sign in to run reports.");
  if (
    !user.active ||
    user.registered === false ||
    !["admin", "manager", "contributor"].includes(user.role)
  )
    throw new HttpError(403, "Team reporting access is required.");
  // The provider checks the current role and managed branches authoritatively.
}

type Cursor = { v: 1; binding: string; fingerprint: string; after: string[] };
function binding(actorId: string, report: string, input: unknown) {
  return createHash("sha256")
    .update(JSON.stringify([actorId, report, input]))
    .digest("hex");
}
function readCursor(
  cursor: string | undefined,
  expectedBinding: string,
  keys: number,
): Cursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Cursor;
    if (
      parsed.v !== 1 ||
      parsed.binding !== expectedBinding ||
      !/^[a-f0-9]{32}$/.test(parsed.fingerprint) ||
      !Array.isArray(parsed.after) ||
      parsed.after.length !== keys ||
      parsed.after.some(
        (id) =>
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
            id,
          ),
      )
    )
      throw new Error("Invalid cursor");
    return parsed;
  } catch {
    throw new HttpError(
      400,
      "This report cursor is invalid or belongs to different filters. Start the report again.",
    );
  }
}
function nextCursor(
  reportBinding: string,
  fingerprint: string,
  after: string[],
) {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      binding: reportBinding,
      fingerprint,
      after,
    } satisfies Cursor),
  ).toString("base64url");
}

/** Shared learning rules receive a deliberately minimal projection without quiz answers. */
export function learningReportRow(
  row: LearningReportProjection,
  dueDatesEnabled: boolean,
  asOf: string,
) {
  const course = {
    ...row.course,
    kind: "course",
    status: "published",
    groups: [],
    assignments: [],
    summary: "",
    body: "",
    folder: "",
    duration: 0,
    updatedAt: "",
    lessons: row.course.lessonIds.map((id) => ({ id, title: "", body: "" })),
    questions: [],
  } satisfies Content;
  const person: User = {
    id: row.personId,
    name: row.personName,
    email: "",
    role: "learner",
    active: true,
    groups: [],
    learningAssignments: row.assignment ? [row.assignment] : [],
  };
  const progress = {
    content_id: course.id,
    version: course.version,
    lessons: row.progress.lessons,
    passed: row.progress.passed,
    // Only activity presence is needed, never attempt answers or correctness.
    attempts: row.progress.attemptCount ? [{ at: "", passed: false }] : [],
  };
  const current = courseProgress(course, [progress]);
  const dueDate = row.assignment
    ? learningTarget(course, person, [], {
        ...defaultSettings,
        dueDatesEnabled,
      }) || null
    : null;
  const overdue = !!dueDate && dueDate < asOf && !current.complete;
  const status = current.complete
    ? "complete"
    : overdue
      ? "overdue"
      : current.started
        ? "in_progress"
        : "not_started";
  if (status !== row.status)
    throw new Error(
      "The reporting provider returned inconsistent learning status.",
    );
  return {
    person: { id: row.personId, name: row.personName },
    team: { id: row.teamId, name: row.teamName },
    groups: row.groups,
    course: {
      id: course.id,
      title: course.title,
      category: course.category,
      version: course.version,
    },
    assignment: row.assignment ? "assigned" : "optional",
    episodeId: row.assignment?.episodeId || null,
    assignedAt: row.assignment?.assignedAt || null,
    savedDueDate: row.assignment?.dueDate || null,
    dueDate,
    dueDatesEnabled,
    sources: row.sources,
    status,
    complete: current.complete,
    started: current.started,
    overdue,
    completedLessons: course.lessons.filter((lesson) =>
      progress.lessons.includes(lesson.id),
    ).length,
    totalLessons: course.lessons.length,
    completionPercent: current.percent,
  };
}

export async function getReportingScopes(user: User | null) {
  requireReporting(user);
  return {
    ...(await dataStore().readMcpReportingScopes(user.id)),
    groupFilterBehavior:
      "Groups narrow people already allowed by team reporting access; they never expand access.",
  };
}

export async function learningReport(user: User | null, rawInput: unknown) {
  requireReporting(user);
  const { cursor, ...parsed } = learningReportInputSchema.parse(rawInput);
  const input = {
    ...parsed,
    teamIds: [...new Set(parsed.teamIds || [])].sort(),
    groupIds: [...new Set(parsed.groupIds || [])].sort(),
    courseIds: [...new Set(parsed.courseIds || [])].sort(),
  };
  // Page size may change between pages; the report definition stays identical.
  const { limit: _limit, ...filters } = input;
  const reportBinding = binding(user.id, "learning", filters);
  const previous = readCursor(cursor, reportBinding, 2);
  const page = await dataStore().readMcpLearningReport(
    user.id,
    input,
    previous
      ? { personId: previous.after[0], courseId: previous.after[1] }
      : null,
    previous?.fingerprint || null,
  );
  const last = page.rows.at(-1);
  return {
    rows: page.rows.map((row) =>
      learningReportRow(row, page.dueDatesEnabled, page.asOf),
    ),
    returnedCount: page.rows.length,
    hasMore: page.hasMore,
    total: page.total,
    totals: page.totals,
    totalsScope: "All rows matching these filters, including subsequent pages.",
    complete: !page.hasMore,
    nextCursor:
      page.hasMore && last
        ? nextCursor(reportBinding, page.fingerprint, [
            last.personId,
            last.course.id,
          ])
        : null,
    asOf: page.asOf,
    dueDatesEnabled: page.dueDatesEnabled,
    optionalBehavior:
      "Optional rows include current-version activity only. Untouched optional courses are excluded and do not affect assigned completion.",
    export:
      "Rows are an export page. Follow nextCursor until complete is true; preserve filters. If learning data changes, start again.",
  };
}

export async function feedbackReport(user: User | null, rawInput: unknown) {
  requirePublisher(user);
  const { cursor, ...input } = feedbackReportInputSchema.parse(rawInput);
  const { limit: _limit, ...filters } = input;
  const reportBinding = binding(user.id, "feedback", filters);
  const previous = readCursor(cursor, reportBinding, 1);
  const page = await dataStore().readMcpFeedbackReport(
    user.id,
    input,
    previous?.after[0] || null,
    previous?.fingerprint || null,
  );
  const last = page.rows.at(-1);
  return {
    rows: page.rows,
    returnedCount: page.rows.length,
    hasMore: page.hasMore,
    total: page.total,
    complete: !page.hasMore,
    nextCursor:
      page.hasMore && last
        ? nextCursor(reportBinding, page.fingerprint, [last.id])
        : null,
    export:
      "Rows are an export page. Follow nextCursor until complete is true; preserve filters. If feedback changes, start again.",
  };
}
