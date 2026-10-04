import type { Workspace } from "./store";
import {
  ancestorIds,
  assignedCourses,
  assignmentInfo,
  assignmentMatches,
  effectiveGroups,
  isComplete,
  reportTeamIds,
  reportingTeamId,
  type AssignmentAudience,
  type User,
} from "./types";
import { assignmentRules } from "./learning";
import {
  completionPercent,
  learningStage,
  learningTarget,
  todayUTC,
} from "./learning";
import type { CsvReport } from "./csv";

export type LearningStatus =
  "current" | "within" | "overdue" | "incomplete" | "unassigned";
export type ProgressPerson = {
  u: User;
  groupIds: string[];
  assigned: number;
  completed: number;
  overdue: number;
  started: boolean;
};
export type ProgressDetail = {
  personId: string;
  asOf?: string;
  deadlinesEnabled?: boolean;
  courses: {
    id: string;
    title: string;
    category: string;
    version: number;
    dueDate?: string;
    assignedAt?: string;
    complete: boolean;
    sources: string[];
  }[];
};
export const statusLabels: Record<LearningStatus, string> = {
  current: "Up to date",
  within: "Within due dates",
  overdue: "Overdue",
  incomplete: "Incomplete",
  unassigned: "No assigned courses",
};
export function personStatus(
  p: ProgressPerson,
  deadlines: boolean,
): LearningStatus {
  return !p.assigned
    ? "unassigned"
    : p.completed === p.assigned
      ? "current"
      : !deadlines
        ? "incomplete"
        : p.overdue
          ? "overdue"
          : "within";
}
/** Same person contract for browser-local data and the compact authorized server read. */
export function progressPeople(
  data: Workspace,
  viewer: User,
  day = data.progressReport?.asOf || todayUTC(),
) {
  const teams = data.teams || [],
    allowed = reportTeamIds(viewer, teams);
  if (
    !viewer.active ||
    viewer.registered === false ||
    !["admin", "manager", "contributor"].includes(viewer.role)
  )
    return [];
  const candidates =
    data.progressReport?.people ||
    data.users.map((u): ProgressPerson => {
      const courses = assignedCourses(
        data.publishedContent || data.content,
        u,
        data.groups,
      );
      const progress = data.progress[u.id] || [];
      return {
        u,
        groupIds: [...effectiveGroups(u, data.groups)],
        assigned: courses.length,
        completed: courses.filter((c) => isComplete(c, progress)).length,
        overdue: courses.filter(
          (c) =>
            !isComplete(c, progress) &&
            (learningTarget(c, u, data.groups, data.settings) || "9999") < day,
        ).length,
        started: courses.some((c) =>
          progress.some(
            (p) =>
              p.content_id === c.id &&
              p.version === c.version &&
              (p.passed || p.lessons.length > 0 || !!p.attempts?.length),
          ),
        ),
      };
    });
  return candidates
    .filter(
      (p) =>
        p.u.active &&
        p.u.id !== "guest" &&
        (viewer.role === "admin" ||
          allowed.has(reportingTeamId(p.u.teamId, teams) || "")),
    )
    .map((p) => ({
      ...p,
      teamId: reportingTeamId(p.u.teamId, teams),
      team:
        teams.find((t) => t.id === reportingTeamId(p.u.teamId, teams))?.name ||
        "Organization",
      percent: p.assigned ? completionPercent(p.completed, p.assigned) : null,
      stage: learningStage(p.u, data.settings, day),
      status: personStatus(p, data.settings?.dueDatesEnabled !== false),
    }));
}
export type ProgressRow = ReturnType<typeof progressPeople>[number];
export type ProgressFilters = {
  team: string;
  query: string;
  personId: string;
  group: string;
  status: string;
  stage: string;
  started: string;
};
export const emptyProgressFilters: ProgressFilters = {
  team: "all",
  query: "",
  personId: "all",
  group: "all",
  status: "all",
  stage: "all",
  started: "all",
};
export function filterProgress(
  rows: ProgressRow[],
  teams: Workspace["teams"],
  f: ProgressFilters,
  sort = "name",
) {
  const words = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows
    .filter(
      (r) =>
        (f.team === "all" ||
          ancestorIds(r.teamId || "", teams || []).has(f.team)) &&
        (f.personId === "all" || r.u.id === f.personId) &&
        words.every((word) =>
          `${r.u.name} ${r.u.email} ${r.team}`.toLowerCase().includes(word),
        ) &&
        (f.group === "all" || r.groupIds.includes(f.group)) &&
        (f.status === "all" || r.status === f.status) &&
        (f.stage === "all" || r.stage === f.stage) &&
        (f.started === "all" || (r.assigned > 0 && !r.started)),
    )
    .sort(
      (a, b) =>
        (sort === "completion"
          ? (a.percent ?? -1) - (b.percent ?? -1)
          : sort === "overdue"
            ? b.overdue - a.overdue
            : sort === "reverse"
              ? b.u.name.localeCompare(a.u.name)
              : 0) ||
        a.u.name.localeCompare(b.u.name) ||
        a.u.id.localeCompare(b.u.id),
    );
}
export function progressSummary(rows: ProgressRow[]) {
  const count = (status: LearningStatus) =>
    rows.filter((r) => r.status === status).length;
  return {
    people: rows.length,
    assignedPeople: rows.filter((r) => r.assigned).length,
    current: count("current"),
    within: count("within"),
    overdue: count("overdue"),
    incomplete: count("incomplete"),
    unassigned: count("unassigned"),
    assignments: rows.reduce((n, r) => n + r.assigned, 0),
    completed: rows.reduce((n, r) => n + r.completed, 0),
  };
}
/** Immediate child branches are disjoint; directly assigned people reconcile the total. */
export function subteamProgress(
  rows: ProgressRow[],
  teams: NonNullable<Workspace["teams"]>,
  teamId: string,
) {
  const root = teams.find((t) => t.system === "organization");
  const parent = teamId === "all" && root ? root.id : teamId;
  const children = teams.filter((t) =>
    parent === "all"
      ? !teams.some((p) => p.id === t.parentId)
      : t.parentId === parent,
  );
  if (!children.length) return [];
  const result = children.map((t) => ({
    id: t.id,
    name: t.name,
    ...progressSummary(
      rows.filter((r) => ancestorIds(r.teamId || "", teams).has(t.id)),
    ),
  }));
  const covered = new Set(
    rows
      .filter((r) =>
        children.some((t) => ancestorIds(r.teamId || "", teams).has(t.id)),
      )
      .map((r) => r.u.id),
  );
  const direct = rows.filter((r) => !covered.has(r.u.id));
  if (direct.length)
    result.push({
      id: "direct",
      name: "Direct members",
      ...progressSummary(direct),
    });
  return result;
}
export function progressPeopleCsv(
  rows: ProgressRow[],
  deadlines: boolean,
): CsvReport {
  return {
    headings: [
      "User",
      "Email",
      "Reporting team",
      "User type",
      "Assigned courses",
      "Completed courses",
      "Completion (%)",
      "Learning status",
      ...(deadlines ? ["Overdue courses"] : []),
    ],
    rows: rows.map((r) => [
      r.u.name,
      r.u.email,
      r.team,
      r.stage,
      r.assigned,
      r.completed,
      r.percent,
      statusLabels[r.status],
      ...(deadlines ? [r.overdue] : []),
    ]),
  };
}
export function localProgressDetail(data: Workspace, u: User): ProgressDetail {
  return {
    personId: u.id,
    asOf: todayUTC(),
    deadlinesEnabled: data.settings?.dueDatesEnabled !== false,
    courses: assignedCourses(
      data.publishedContent || data.content,
      u,
      data.groups,
    ).map((c) => {
      const episode = u.learningAssignments?.find(
        (a) => a.contentId === c.id && a.version === c.version,
      );
      const audiences =
        episode?.sourceAudiences ||
        assignmentRules(c)
          .filter((a) => assignmentMatches(a, u, data.groups))
          .flatMap<AssignmentAudience>((a) =>
            a.groupId
              ? [{ kind: "group" as const, id: a.groupId }]
              : a.teamId
                ? [{ kind: "team" as const, id: a.teamId }]
                : [],
          );
      return {
        id: c.id,
        title: c.title,
        category: c.category,
        version: c.version,
        dueDate: learningTarget(c, u, data.groups, data.settings),
        assignedAt:
          episode?.assignedAt || assignmentInfo(c, u, data.groups).assignedAt,
        complete: isComplete(c, data.progress[u.id] || []),
        sources:
          audiences?.map((a) =>
            a.kind === "group"
              ? data.groups.find((g) => g.id === a.id)?.name || "Learning group"
              : data.teams?.find((t) => t.id === a.id)?.name ||
                "Inherited team assignment",
          ) || [],
      };
    }),
  };
}
/** The person table and its export share the same course discovery controls. */
export function filterProgressAssignments(
  detail: ProgressDetail,
  filters: { query: string; status: string; sort: string },
  deadlines = detail.deadlinesEnabled !== false,
): ProgressDetail {
  const search = filters.query.trim().toLocaleLowerCase();
  const asOf = detail.asOf || todayUTC();
  return {
    ...detail,
    courses: detail.courses
      .filter((course) => {
        const overdue =
          !course.complete &&
          deadlines &&
          !!course.dueDate &&
          course.dueDate < asOf;
        return (
          course.title.toLocaleLowerCase().includes(search) &&
          (filters.status === "all" ||
            (filters.status === "complete" && course.complete) ||
            (filters.status === "incomplete" && !course.complete) ||
            (filters.status === "overdue" && overdue))
        );
      })
      .sort((a, b) => {
        const name = a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
        if (filters.sort === "name") return name;
        if (filters.sort === "reverse") return -name;
        // Unknown assignment dates belong last in both date orders.
        if (!a.assignedAt || !b.assignedAt)
          return Number(!a.assignedAt) - Number(!b.assignedAt) || name;
        const date = Date.parse(a.assignedAt) - Date.parse(b.assignedAt);
        return (filters.sort === "oldest" ? date : -date) || name;
      }),
  };
}

export function progressDetailCsv(
  detail: ProgressDetail,
  row: ProgressRow,
  deadlines: boolean,
): CsvReport {
  return {
    headings: [
      "User",
      "Email",
      "Course",
      "Category",
      "Published version",
      "Status",
      ...(deadlines ? ["Due date"] : []),
      "Assigned at",
      "Assignment sources",
    ],
    rows: detail.courses.map((c) => [
      row.u.name,
      row.u.email,
      c.title,
      c.category,
      c.version,
      c.complete
        ? "Complete"
        : deadlines && c.dueDate && c.dueDate < (detail.asOf || todayUTC())
          ? "Overdue"
          : "Incomplete",
      ...(deadlines ? [c.dueDate || ""] : []),
      c.assignedAt || "",
      c.sources.join("; "),
    ]),
  };
}
