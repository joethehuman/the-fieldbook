export type Lesson = {
  id: string;
  title: string;
  body: string;
  videoUrl?: string;
};
export type Question = {
  id: string;
  prompt: string;
  options: string[];
  optionIds?: string[];
  correctOptionIds?: string[];
  explanation?: string;
  multiple?: boolean;
  answer?: number;
};
export type Content = {
  revision?: number;
  publishedRevision?: number | null;
  id: string;
  kind: "doc" | "brief" | "course";
  title: string;
  summary: string;
  body: string;
  category: string;
  folder: string;
  sectionId?: string;
  sectionOrder?: number;
  status: "draft" | "published";
  version: number;
  updatedAt: string;
  feedAt?: string;
  createdAt?: string;
  assignments?: Assignment[];
  coverImageUrl?: string;
  cardArt?: import("./card-art").CardArt;
  duration: number;
  groups: string[];
  lessons: Lesson[];
  questions: Question[];
  /** Missing on older published courses, which retain the original passing rule. */
  requirePassing?: boolean;
};
export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "learner" | "manager";
  groups: string[];
  active: boolean;
  onboardingStart?: string;
  teamId?: string;
  groupJoinedAt?: Record<string, string>;
  effectiveGroupJoinedAt?: Record<string, string>;
};
export type Progress = {
  revision?: number;
  content_id: string;
  version: number;
  lessons: string[];
  /** Legacy database column: course completion, separate from attempt correctness. */
  passed: boolean;
  attempts?: {
    at: string;
    passed: boolean;
    version?: number;
    answers?: { questionId: string; optionIds: string[]; correct: boolean }[];
  }[];
};
export type LearningItem = { kind: "course" | "curriculum"; id: string };
export type Curriculum = {
  id: string;
  name: string;
  description: string;
  courseIds: string[];
  status: "draft" | "published";
  cardArt?: import("./card-art").CardArt;
};
export type Group = {
  id: string;
  name: string;
  parentId?: string;
  requiredCourseIds?: string[];
  learningItems?: LearningItem[];
  teamIds?: string[];
};
export type Team = {
  id: string;
  name: string;
  parentId?: string;
  managerId?: string;
};
export type Assignment = {
  groupId?: string;
  userId?: string;
  assignedAt: string;
  due:
    | { type: "none" }
    | { type: "date"; date: string }
    | { type: "days"; days: number };
};
export type Feedback = {
  id: string;
  userId: string;
  contentId?: string;
  version?: number;
  rating: "up" | "down";
  comment: string;
  updatedAt: string;
};
// Ancestor traversal is cycle-safe for imported or older demo data.
export function ancestorIds(
  id: string,
  nodes: { id: string; parentId?: string }[],
) {
  const found = new Set<string>();
  let current: string | undefined = id;
  while (current && !found.has(current)) {
    found.add(current);
    current = nodes.find((n) => n.id === current)?.parentId;
  }
  return found;
}
export function canParent(
  id: string,
  parentId: string,
  nodes: { id: string; parentId?: string }[],
) {
  return !parentId || !ancestorIds(parentId, nodes).has(id);
}
export function effectiveGroups(user: User, groups: Group[]) {
  const direct = [
    ...user.groups,
    ...groups
      .filter((g) => user.teamId && g.teamIds?.includes(user.teamId))
      .map((g) => g.id),
  ];
  return new Set(direct.flatMap((id) => [...ancestorIds(id, groups)]));
}
export function assignmentInfo(c: Content, user: User, groups: Group[]) {
  const memberships = effectiveGroups(user, groups);
  const rules: Assignment[] =
    c.assignments ??
    c.groups.map((groupId) => ({
      groupId,
      assignedAt: c.createdAt || c.updatedAt,
      due: { type: "none" },
    }));
  const matches = rules
    .filter((r) => !!r.groupId && memberships.has(r.groupId))
    .map((r) => {
      const joined =
        (r.groupId ? user.effectiveGroupJoinedAt?.[r.groupId] : r.assignedAt) ||
        user.groups
          .filter((id) => ancestorIds(id, groups).has(r.groupId || ""))
          .map((id) => user.groupJoinedAt?.[id] || r.assignedAt)
          .sort()[0] ||
        r.assignedAt;
      const assignedAt = joined > r.assignedAt ? joined : r.assignedAt;
      let dueDate: string | undefined;
      if (r.due.type === "date") dueDate = r.due.date;
      if (r.due.type === "days") {
        const day = new Date(assignedAt.slice(0, 10) + "T00:00:00Z");
        day.setUTCDate(day.getUTCDate() + r.due.days);
        dueDate = day.toISOString().slice(0, 10);
      }
      return { assignedAt, dueDate };
    });
  return {
    assignedAt: matches.map((m) => m.assignedAt).sort()[0],
    dueDate: matches.flatMap((m) => (m.dueDate ? [m.dueDate] : [])).sort()[0],
  };
}
export function reportTeamIds(user: User, teams: Team[]) {
  if (user.role === "admin") return new Set(teams.map((t) => t.id));
  if (!user.active || user.role !== "manager") return new Set<string>();
  const roots = teams.filter((t) => t.managerId === user.id).map((t) => t.id);
  return new Set(
    teams
      .filter((t) => roots.some((id) => ancestorIds(t.id, teams).has(id)))
      .map((t) => t.id),
  );
}
export type Snapshot = {
  user: User;
  content: Content[];
  progress: Progress[];
  groups: Group[];
  users?: User[];
  report?: {
    user_id: string;
    content_id: string;
    version: number;
    passed: boolean;
  }[];
};
export function isComplete(course: Content, progress: Progress[]) {
  const p = progress.find(
    (p) => p.content_id === course.id && p.version === course.version,
  );
  return (
    !!p && p.passed && course.lessons.every((l) => p.lessons.includes(l.id))
  );
}
export function assignedCourses(
  content: Content[],
  user: User,
  groups: Group[] = [],
) {
  const memberships = effectiveGroups(user, groups);
  return content.filter(
    (c) =>
      c.kind === "course" &&
      c.status === "published" &&
      (c.assignments
        ? c.assignments.some((a) => !!a.groupId && memberships.has(a.groupId))
        : c.groups.some((g) => memberships.has(g))),
  );
}
