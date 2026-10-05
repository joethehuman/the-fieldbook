import { DEMO_PROFILE_IDS } from "./demo-session";
import { reconcileLearning } from "./learning-groups";
import { reconcileAssignments } from "./assignment-episodes";
import { flattenLearningGroups } from "./group-conversion";
import {
  validateOrganizationTeams,
  withOrganizationTeam,
} from "./organization-team";
import { expireDemoDeleted } from "./bulk-actions";
import { contentSignature, withPublishedSnapshots } from "./demo-publication";
import { defaultSettings } from "./settings";
import { DOC_CATEGORY_ORDER, seedContent } from "./seed";
import { hooliDemoData } from "./demo-fixtures/hooli";
import { withCourseOpeningVideo } from "./demo-fixtures/course-opening-videos";
import type { Content, User, Group, Progress, Feedback, Team } from "./types";
import { gradeQuiz, quizUnlocked } from "./course-quiz";
export type Workspace = {
  /** Read-only report projection; not part of governance writes. */
  progressReport?: {
    asOf: string;
    people: import("./progress-report").ProgressPerson[];
  };
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
export { SESSION, DEMO_PROFILE_IDS } from "./demo-session";
export function freshWorkspace(): Workspace {
  const { settings, contentOverrides, ...sample } =
    structuredClone(hooliDemoData);
  return withOrganizationTeam({
    schema: 1,
    ...sample,
    settings: {
      ...defaultSettings,
      ...settings,
      name: "Hoolibook",
      docCategoryOrder: [...DOC_CATEGORY_ORDER],
    },
    content: structuredClone(seedContent).map((item) =>
      withCourseOpeningVideo({ ...item, ...contentOverrides[item.id] }),
    ),
  });
}
/** Refresh untouched sample lessons in existing browsers without replacing edits. */
function refreshDemoCourseOpeningVideos(data: Workspace): Workspace {
  const originals = new Map(seedContent.map((item) => [item.id, item]));
  let changed = false;
  const refresh = (items: Content[]) =>
    items.map((item) => {
      const first = item.lessons[0];
      const seed = originals.get(item.id);
      const original = seed?.lessons[0];
      if (
        item.kind !== "course" ||
        !first ||
        !original ||
        first.id !== original.id ||
        first.title !== original.title
      )
        return item;
      const previousBody = original.videoUrl
        ? `[Video](${original.videoUrl})\n\n${original.body}`
        : original.body;
      const currentOpeningVideo = withCourseOpeningVideo(seed!).lessons[0].videoUrl;
      const untouchedSeed =
        first.body === original.body && first.videoUrl === original.videoUrl;
      const previousOpening =
        first.body === previousBody && first.videoUrl === currentOpeningVideo;
      if (!untouchedSeed && !previousOpening) return item;
      const updated = withCourseOpeningVideo(item);
      if (updated === item) return item;
      changed = true;
      return item.publishedSignature === contentSignature(item)
        ? { ...updated, publishedSignature: contentSignature(updated) }
        : updated;
    });
  const content = refresh(data.content);
  const publishedContent = data.publishedContent && refresh(data.publishedContent);
  return changed ? { ...data, content, publishedContent } : data;
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
  if (!raw) {
    const fresh = withPublishedSnapshots(freshWorkspace());
    const saved = reconcileLearning(fresh, fresh);
    saveWorkspace(saved);
    return saved;
  }
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
  const refreshed = refreshDemoCourseOpeningVideos(upgraded);
  const repaired = expireDemoDeleted(repairHooliSecurityAssignment(refreshed));
  const legacy = repaired.users.some((p) => !p.learningAssignments)
    ? {
        ...repaired,
        groups: repaired.groups.map((g) => ({
          ...g,
          teamLinkScope:
            g.teamLinkScope ||
            (g.teamIds?.length ? ("direct" as const) : ("subtree" as const)),
        })),
      }
    : repaired;
  const current = withOrganizationTeam(flattenLearningGroups(legacy));
  if (current.users.some((p) => !p.learningAssignments)) {
    current.users = reconcileAssignments(
      current,
      current,
      new Date().toISOString(),
      true,
    );
    saveWorkspace(current);
  }
  if (current !== upgraded) saveWorkspace(current);
  const reconciled = reconcileLearning(current, current);
  if (JSON.stringify(reconciled) !== JSON.stringify(current))
    saveWorkspace(reconciled);
  return reconciled;
}
export function saveWorkspace(data: Workspace) {
  const previous = localStorage.getItem(KEY);
  const old: Workspace | undefined = previous
    ? JSON.parse(previous)
    : undefined;
  // Legacy snapshots convert on load; once converted, ordinary writes preserve the root.
  if (old?.teams?.some((team) => team.system === "organization"))
    validateOrganizationTeams(
      data.teams || [],
      data.settings?.organizationTeamId,
      old.teams,
      old.settings?.organizationTeamId,
    );
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
