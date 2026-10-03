import { withOrganizationTeam } from "../../lib/organization-team";
import { defaultSettings } from "../../lib/settings";
import { DOC_CATEGORY_ORDER, seedContent } from "../../lib/seed";
import type { Progress } from "../../lib/types";
import type { Workspace } from "../../lib/store";

/** Original small demo snapshot for legacy storage and focused model regressions. */
const completedCourse = (id: string): Progress => ({
  content_id: id,
  version: 1,
  lessons: [`${id}-1`, `${id}-2`, `${id}-3`],
  passed: true,
});
export function legacyWorkspace(): Workspace {
  return withOrganizationTeam({
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
  });
}
