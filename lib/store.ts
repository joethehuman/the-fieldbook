import { expireDemoDeleted } from "./bulk-actions";
import { withPublishedSnapshots } from "./demo-publication";
import { defaultSettings } from "./settings";
import { DOC_CATEGORY_ORDER, seedContent } from "./seed";
import type { Content, User, Group, Progress, Feedback, Team } from "./types";
import { gradeQuiz, quizUnlocked } from "./course-quiz";
export type Workspace = {
  cleanupStatus?: { configured: boolean; lastRun?: string };
  deletedItems?: import("./bulk-actions").DeletedItem[];
  settings?: import("./settings").SiteSettings;
  revision?: number;
  governanceRevision?: number;
  /** Transient preregistration commands; saved roster people live in users. */
  pendingUsers?: {
    email: string;
    name: string;
    role: User["role"];
    groups: string[];
    teamId?: string;
    onboardingStart?: string;
    hireDate?: string;
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
export const DEMO_PROFILE_IDS = [
  "demo-learner",
  "demo-manager",
  "demo-contributor",
  "demo-admin",
];
const completedCourse = (id: string): Progress => ({
  content_id: id,
  version: 1,
  lessons: [`${id}-1`, `${id}-2`, `${id}-3`],
  passed: true,
});
export function freshWorkspace(): Workspace {
  return {
    schema: 1,
    settings: {
      ...defaultSettings,
      name: "Hoolibook",
      docCategoryOrder: [...DOC_CATEGORY_ORDER],
    },
    content: structuredClone(seedContent).map((c) =>
      c.kind === "brief" && ["brief-1", "brief-2"].includes(c.id)
        ? { ...c, groups: ["sales"] }
        : c,
    ),
    curricula: [
      {
        id: "sales-foundations",
        name: "Hooli sales foundations",
        description:
          "Build customer conversation skills using Hooli\'s current product guidance.",
        status: "published",
        courseIds: ["course-4", "course-11", "course-12"],
      },
    ],
    teams: [
      { id: "sales-team", name: "Sales team", managerId: "demo-manager" },
    ],
    feedback: [],
    users: [
      {
        id: "demo-learner",
        hireDate: new Date().toISOString().slice(0, 10),
        onboardingDays: defaultSettings.onboardingDays,
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
      {
        id: "demo-contributor",
        name: "Jordan Patel",
        email: "contributor@example.com",
        role: "contributor",
        groups: [],
        active: true,
      },
    ],
    groups: [
      {
        id: "sales",
        name: "Account executives",
        requiredCourseIds: ["course-4", "course-11", "course-12", "course-10"],
        learningItems: [
          { kind: "curriculum", id: "sales-foundations" },
          { kind: "course", id: "course-10" },
        ],
        teamIds: [],
      },
    ],
    progress: {
      "demo-learner": [completedCourse("course-4")],
      "demo-rep-2": [],
      "demo-rep-3": [completedCourse("course-4"), completedCourse("course-11")],
      "demo-rep-4": [
        completedCourse("course-4"),
        completedCourse("course-10"),
        completedCourse("course-11"),
        completedCourse("course-12"),
      ],
      "demo-rep-5": [completedCourse("course-12")],
    },
  };
}
/** Repair only the original Hoolibook sample group's conflicting course selection. */
function repairHooliSecurityAssignment(data: Workspace): Workspace {
  const group = data.groups.find((item) => item.id === "sales");
  const curriculum = data.curricula?.find(
    (item) => item.id === "sales-foundations",
  );
  const security = data.content.find((item) => item.id === "course-10");
  const expectedCurriculum = ["course-4", "course-11", "course-12"];
  const originalSelection = ["course-4", "course-10", "course-11", "course-12"];
  const matching = (ids: string[] | undefined, expected: string[]) =>
    !!ids &&
    ids.length === expected.length &&
    ids.every((id, index) => id === expected[index]);
  const hasOriginalSelection = matching(
    group?.requiredCourseIds,
    originalSelection,
  );
  const hasReducedSelection = matching(
    group?.requiredCourseIds,
    expectedCurriculum,
  );
  if (
    group?.name !== "Account executives" ||
    !matching(curriculum?.courseIds, expectedCurriculum) ||
    (!hasOriginalSelection && !hasReducedSelection) ||
    group.learningItems?.length !== 1 ||
    group.learningItems?.[0]?.kind !== "curriculum" ||
    group.learningItems?.[0]?.id !== "sales-foundations" ||
    security?.title !== "Security Basics: Don’t Paste That Here" ||
    security.version !== 1 ||
    security.status !== "published" ||
    !data.publishedContent?.some(
      (item) =>
        item.id === security.id &&
        item.version === security.version &&
        item.status === "published",
    )
  )
    return data;

  // The original selection is an unsaved seed. After it is dropped, repair
  // only when a selectable demo profile started the course. Another sample
  // rep starts with completion, so checking every progress record is too broad.
  if (
    hasReducedSelection &&
    !DEMO_PROFILE_IDS.some((id) =>
      data.progress[id]?.some(
        (record) =>
          record.content_id === security.id &&
          record.version === security.version,
      ),
    )
  )
    return data;

  const restore = (items: Content[]) =>
    items.map((item) =>
      item.id === security.id
        ? {
            ...item,
            groups: [...new Set([...item.groups, group.id])],
            assignments: item.assignments?.some(
              (rule) => rule.groupId === group.id,
            )
              ? item.assignments
              : [
                  ...(item.assignments || []),
                  {
                    groupId: group.id,
                    assignedAt: item.createdAt || item.updatedAt,
                    due: { type: "none" as const },
                  },
                ],
          }
        : item,
    );
  return {
    ...data,
    groups: data.groups.map((item) =>
      item.id === group.id
        ? {
            ...item,
            requiredCourseIds: [...expectedCurriculum, security.id],
            learningItems: [
              ...item.learningItems!,
              { kind: "course" as const, id: security.id },
            ],
          }
        : item,
    ),
    content: restore(data.content),
    publishedContent: data.publishedContent && restore(data.publishedContent),
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
  if (!data.users.some((user: User) => user.id === "demo-contributor"))
    data.users.push(
      freshWorkspace().users.find((user) => user.id === "demo-contributor")!,
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
    if (
      (user.hireDate || user.onboardingStart) &&
      user.onboardingDays === undefined
    )
      user.onboardingDays = data.settings?.onboardingDays ?? 90;
    const renamed = renamedProfiles[user.id];
    if (renamed?.previous.includes(user.name)) user.name = renamed.name;
  }
  const upgraded = withPublishedSnapshots(data);
  const current = expireDemoDeleted(repairHooliSecurityAssignment(upgraded));
  if (current !== upgraded) saveWorkspace(current);
  return current;
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
    const selections = answers.map((answer) =>
      Array.isArray(answer) ? answer : [answer],
    );
    const graded = gradeQuiz(course, selections);
    (p.attempts ??= []).push({
      at: new Date().toISOString(),
      version: course.version,
      passed: graded.passed,
      answers: graded.answers,
    });
  }
  if (complete) {
    const unlocked = quizUnlocked(course, p.attempts);
    if (
      !course.lessons.every((lesson) => p!.lessons.includes(lesson.id)) ||
      (!unlocked && !answers)
    )
      throw new Error(
        "Finish the lessons and quiz before completing this course.",
      );
    if (unlocked) p.passed = true;
  }
  return next;
}
