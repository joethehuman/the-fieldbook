import type { Workspace } from "./store";
import {
  ancestorIds,
  assignedCourses,
  isComplete,
  reportTeamIds,
  type Content,
  type User,
} from "./types";
import {
  completionPercent,
  learningState,
  learningTarget,
  todayUTC,
} from "./learning";
import { csvTimestamp, type CsvReport } from "./csv";

// These projections are shared by the screen and CSV. They accept only the
// workspace already authorized by the server; they do not retrieve more data.
export function teamProgressRows(
  data: Workspace,
  viewer: User,
  teamId = "all",
  query = "",
) {
  const teams = data.teams || [],
    allowed = reportTeamIds(viewer, teams);
  if (!viewer.active) return [];
  return data.users
    .filter(
      (u) =>
        u.active &&
        (viewer.role === "admin" ||
          (viewer.role === "manager" && !!u.teamId && allowed.has(u.teamId))) &&
        (teamId === "all" ||
          (!!u.teamId && ancestorIds(u.teamId, teams).has(teamId))) &&
        `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()),
    )
    .map((u) => {
      const assigned = assignedCourses(
        data.publishedContent || data.content,
        u,
        data.groups,
      );
      const completed = assigned.filter((c) =>
        isComplete(c, data.progress[u.id] || []),
      ).length;
      return {
        u,
        assigned,
        completed,
        team: teams.find((t) => t.id === u.teamId)?.name || "No team",
        percent: assigned.length
          ? completionPercent(completed, assigned.length)
          : null,
        status: learningState(
          data.publishedContent || data.content,
          u,
          data.groups,
          data.progress[u.id] || [],
          data.settings,
        ).status,
      };
    });
}
export function teamProgressCsv(
  rows: ReturnType<typeof teamProgressRows>,
): CsvReport {
  return {
    headings: [
      "Person",
      "Email",
      "Reporting team",
      "Assigned courses",
      "Completed courses",
      "Completion (%)",
      "Learning status",
    ],
    rows: rows.map((r) => [
      r.u.name,
      r.u.email,
      r.team,
      r.assigned.length,
      r.completed,
      r.percent,
      r.status,
    ]),
  };
}
export function courseProgressRow(
  data: Workspace,
  u: User,
  c: Content,
  view: "team" | "assignment" = "assignment",
) {
  const p = (data.progress[u.id] || []).find(
    (p) => p.content_id === c.id && p.version === c.version,
  );
  const done = isComplete(c, data.progress[u.id] || []);
  const target = learningTarget(c, u, data.groups, data.settings);
  const status = done
    ? view === "team"
      ? "Completed"
      : "Complete"
    : target && target < todayUTC()
      ? "Needs attention"
      : view === "team"
        ? "Outstanding"
        : "On track";
  return {
    u,
    c,
    p,
    done,
    target,
    status,
    team: data.teams?.find((t) => t.id === u.teamId)?.name || "No team",
    assignment: assignedCourses(
      data.publishedContent || data.content,
      u,
      data.groups,
    ).some((a) => a.id === c.id)
      ? "Assigned"
      : "Optional",
    lessons: p?.lessons.length || 0,
    progress: done
      ? "Complete"
      : `${p?.lessons.length || 0} of ${c.lessons.length} lessons`,
  };
}
export function courseProgressCsv(
  rows: ReturnType<typeof courseProgressRow>[],
  view: "team" | "assignment" = "assignment",
): CsvReport {
  const headings = [
    "Person",
    "Email",
    "Reporting team",
    "Course",
    "Category",
    "Published version",
    "Assignment",
    "Target date",
    "Status",
  ];
  return {
    headings:
      view === "team"
        ? headings
        : [...headings, "Progress", "Recorded lessons", "Total lessons"],
    rows: rows.map((r) => {
      const values = [
        r.u.name,
        r.u.email,
        r.team,
        r.c.title,
        r.c.category,
        r.c.version,
        r.assignment,
        r.target,
        r.status,
      ];
      return view === "team"
        ? values
        : [...values, r.progress, r.lessons, r.c.lessons.length];
    }),
  };
}
export function feedbackRows(
  data: Workspace,
  kind = "all",
  item = "all",
  rating = "all",
  query = "",
  sort = "newest",
) {
  return (data.feedback || [])
    .filter((f) => {
      const c = data.content.find((c) => c.id === f.contentId);
      return (
        (kind === "all" || c?.kind === kind) &&
        (item === "all" || f.contentId === item) &&
        (rating === "all" || f.rating === rating) &&
        `${c?.title || ""} ${f.comment}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .sort((a, b) =>
      sort === "newest"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : a.updatedAt.localeCompare(b.updatedAt),
    )
    .map((f) => {
      const c = data.content.find((c) => c.id === f.contentId);
      return {
        ...f,
        title: c?.title || "Removed content",
        kind:
          c?.kind === "course"
            ? "Course"
            : c?.kind === "brief"
              ? "Update"
              : c?.kind === "doc"
                ? "Doc"
                : "Removed content",
        person:
          f.userId === "guest"
            ? "Guest visitor"
            : data.users.find((u) => u.id === f.userId)?.name || "Former user",
        ratingLabel: f.rating === "up" ? "Useful" : "Not useful",
      };
    });
}
export function feedbackCsv(rows: ReturnType<typeof feedbackRows>): CsvReport {
  return {
    headings: [
      "Content",
      "Content type",
      "Content version",
      "Person",
      "Rating",
      "Comment",
      "Updated at (UTC)",
    ],
    rows: rows.map((r) => [
      r.title,
      r.kind,
      r.version,
      r.person,
      r.ratingLabel,
      r.comment,
      csvTimestamp(r.updatedAt),
    ]),
  };
}
