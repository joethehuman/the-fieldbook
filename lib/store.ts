import { seedContent } from "./seed";
import type { Content, User, Group, Progress, Feedback, Team } from "./types";
export type Workspace = {
  schema: 1;
  feedback?: Feedback[];
  teams?: Team[];
  content: Content[];
  users: User[];
  groups: Group[];
  progress: Record<string, Progress[]>;
};
const KEY = "fieldbook.workspace.v1";
export const SESSION = "fieldbook.profile.v1";
export function freshWorkspace(): Workspace {
  return {
    schema: 1,
    content: structuredClone(seedContent),
    teams: [
      { id: "field", name: "Field team", managerId: "demo-manager" },
      {
        id: "startup",
        name: "Startup sales",
        parentId: "field",
        managerId: "demo-manager",
      },
    ],
    feedback: [],
    users: [
      {
        id: "demo-learner",
        name: "Alex Morgan",
        email: "alex@example.com",
        role: "learner",
        groups: ["sales"],
        teamId: "startup",
        active: true,
      },
      {
        id: "demo-solutions",
        name: "Sam Taylor",
        email: "sam@example.com",
        role: "learner",
        groups: ["solutions"],
        active: true,
      },
      {
        id: "demo-admin",
        name: "Workspace admin",
        email: "admin@example.com",
        role: "admin",
        groups: ["sales"],
        active: true,
      },
      {
        id: "demo-manager",
        name: "Jordan Lee",
        email: "jordan@example.com",
        role: "manager",
        groups: ["sales"],
        teamId: "field",
        active: true,
      },
    ],
    groups: [
      { id: "sales", name: "Account executives" },
      { id: "solutions", name: "Solutions engineers" },
    ],
    progress: {
      "demo-learner": [
        {
          content_id: "course-1",
          version: 1,
          lessons: ["course-1-1", "course-1-2"],
          passed: true,
        },
      ],
    },
  };
}
export function loadWorkspace(): Workspace {
  const raw = localStorage.getItem(KEY);
  if (!raw) return freshWorkspace();
  const data = JSON.parse(raw);
  if (
    data.schema !== 1 ||
    !Array.isArray(data.content) ||
    !Array.isArray(data.users) ||
    !Array.isArray(data.groups) ||
    !data.progress
  )
    throw new Error(
      "Saved demo data could not be opened. Export or reset this browser’s demo.",
    );
  return data;
}
export function saveWorkspace(data: Workspace) {
  localStorage.setItem(KEY, JSON.stringify(data));
}
export function updateProgress(
  data: Workspace,
  userId: string,
  course: Content,
  lessonId?: string,
  answers?: number[],
): Workspace {
  const next = structuredClone(data);
  const list = (next.progress[userId] ??= []);
  let p = list.find(
    (p) => p.content_id === course.id && p.version === course.version,
  );
  if (!p) {
    p = {
      content_id: course.id,
      version: course.version,
      lessons: [],
      passed: course.questions.length === 0,
    };
    list.push(p);
  }
  if (
    lessonId &&
    course.lessons.some((l) => l.id === lessonId) &&
    !p.lessons.includes(lessonId)
  )
    p.lessons.push(lessonId);
  if (answers && course.lessons.every((l) => p!.lessons.includes(l.id))) {
    const passed = course.questions.every((q, i) => q.answer === answers[i]);
    (p.attempts ??= []).push({ at: new Date().toISOString(), passed });
    p.passed = p.passed || passed;
  }
  return next;
}
