import { withPublishedSnapshots } from "./demo-publication";
import { seedContent } from "./seed";
import type { Content, User, Group, Progress, Feedback, Team } from "./types";
import { gradeQuiz, quizUnlocked } from "./course-quiz";
export type Workspace = {
  settings?: import("./settings").SiteSettings;
  revision?: number;
  governanceRevision?: number;
  pendingUsers?: {
    email: string;
    name: string;
    role: User["role"];
    groups: string[];
    teamId?: string;
    onboardingStart?: string;
  }[];
  publishedContent?: Content[];
  schema: 1;
  feedback?: Feedback[];
  teams?: Team[];
  curricula?: import("./types").Curriculum[];
  content: Content[];
  users: User[];
  groups: Group[];
  progress: Record<string, Progress[]>;
};
const KEY = "fieldbook.workspace.v1";
export const SESSION = "fieldbook.profile.v1";
export const DEMO_PROFILE_IDS = ["demo-learner", "demo-manager", "demo-admin"];
const completedCourse = (id: string): Progress => ({
  content_id: id,
  version: 1,
  lessons: [`${id}-1`, `${id}-2`],
  passed: true,
});
export function freshWorkspace(): Workspace {
  return {
    schema: 1,
    content: structuredClone(seedContent).map((c) =>
      c.kind === "brief" && ["brief-1", "brief-2"].includes(c.id)
        ? { ...c, groups: ["sales"] }
        : c,
    ),
    curricula: [
      {
        id: "sales-foundations",
        name: "Account executive foundations",
        description:
          "Get oriented, learn the product story, and build your discovery skills.",
        status: "published",
        courseIds: ["course-1", "course-2", "course-3"],
      },
    ],
    teams: [
      { id: "sales-team", name: "Sales team", managerId: "demo-manager" },
    ],
    feedback: [],
    users: [
      {
        id: "demo-learner",
        onboardingStart: new Date().toISOString().slice(0, 10),
        name: "Alex Edwards",
        email: "alex@example.com",
        role: "learner",
        groups: ["sales"],
        teamId: "sales-team",
        active: true,
      },
      {
        id: "demo-rep-2",
        name: "Sam Taylor",
        email: "sam@example.com",
        role: "learner",
        groups: ["sales"],
        teamId: "sales-team",
        active: true,
      },
      {
        id: "demo-rep-3",
        name: "Casey Rivera",
        email: "casey@example.com",
        role: "learner",
        groups: ["sales"],
        teamId: "sales-team",
        active: true,
      },
      {
        id: "demo-rep-4",
        name: "Taylor Chen",
        email: "taylor@example.com",
        role: "learner",
        groups: ["sales"],
        teamId: "sales-team",
        active: true,
      },
      {
        id: "demo-rep-5",
        name: "Morgan Patel",
        email: "morgan@example.com",
        role: "learner",
        groups: ["sales"],
        teamId: "sales-team",
        active: true,
      },
      {
        id: "demo-admin",
        name: "Oliver Anderson",
        email: "admin@example.com",
        role: "admin",
        groups: ["sales"],
        active: true,
      },
      {
        id: "demo-manager",
        name: "Sara Downy",
        email: "jordan@example.com",
        role: "manager",
        groups: ["sales"],
        active: true,
      },
    ],
    groups: [
      {
        id: "sales",
        name: "Account executives",
        requiredCourseIds: ["course-1", "course-2", "course-3"],
        learningItems: [{ kind: "curriculum", id: "sales-foundations" }],
        teamIds: [],
      },
    ],
    progress: {
      "demo-learner": [completedCourse("course-1")],
      "demo-rep-2": [],
      "demo-rep-3": [completedCourse("course-1"), completedCourse("course-2")],
      "demo-rep-4": [
        completedCourse("course-1"),
        completedCourse("course-2"),
        completedCourse("course-3"),
      ],
      "demo-rep-5": [completedCourse("course-3")],
    },
  };
}
export function loadWorkspace(): Workspace {
  const raw = localStorage.getItem(KEY);
  if (!raw) return withPublishedSnapshots(freshWorkspace());
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
  // Refresh saved default personas without replacing visitors' custom names.
  const renamedProfiles: Record<string, { previous: string[]; name: string }> =
    {
      "demo-learner": { previous: ["Alex Morgan"], name: "Alex Edwards" },
      "demo-manager": { previous: ["Jordan Lee"], name: "Sara Downy" },
      "demo-admin": {
        previous: ["Organization Admin", "Org Admin"],
        name: "Oliver Anderson",
      },
    };
  for (const user of data.users as User[]) {
    const renamed = renamedProfiles[user.id];
    if (renamed?.previous.includes(user.name)) user.name = renamed.name;
  }
  return withPublishedSnapshots(data);
}
export function saveWorkspace(data: Workspace) {
  localStorage.setItem(KEY, JSON.stringify(data));
}
export function updateProgress(
  data: Workspace,
  userId: string,
  course: Content,
  lessonId?: string,
  answers?: number[] | import("./course-quiz").QuizAnswers,
  complete = false,
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
      passed: false,
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
    const selections = answers.map((answer) => Array.isArray(answer) ? answer : [answer]);
    const graded = gradeQuiz(course, selections);
    (p.attempts ??= []).push({ at: new Date().toISOString(), version: course.version, passed: graded.passed, answers: graded.answers });
  }
  if (complete) {
    if (!course.lessons.every((lesson) => p!.lessons.includes(lesson.id)) || !quizUnlocked(course, p.attempts))
      throw new Error("Finish the lessons and quiz before completing this course.");
    p.passed = true;
  }
  return next;
}
