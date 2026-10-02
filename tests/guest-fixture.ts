import { freshWorkspace } from "../lib/store";
import { defaultSettings } from "../lib/settings";
import { reconcileLearning } from "../lib/learning-groups";
export function guestFixture() {
  const before = freshWorkspace(),
    data = structuredClone(before);
  const courses = data.content.filter((c) => c.kind === "course").slice(0, 3);
  courses.forEach((c, i) => {
    c.id = `00000000-0000-4000-8000-00000000000${i + 1}`;
    c.title = ["Foundation course", "Guest course", "Optional course"][i];
    c.lessons = [
      { id: "lesson", title: "One lesson", body: "Learn something useful." },
    ];
    c.questions = [
      {
        id: "quiz",
        prompt: "Choose the correct answer",
        options: ["Correct", "Try again"],
        answer: 0,
      },
    ];
  });
  const update = data.content.find((c) => c.kind === "brief")!;
  data.content = [
    ...courses,
    {
      ...update,
      id: "update",
      title: "Recommended update",
      groups: ["foundation", "visitors"],
    },
    { ...update, id: "other", title: "Other update", groups: [] },
  ];
  data.groups = [
    {
      id: "foundation",
      name: "Broader learning group",
      learningItems: [{ kind: "course", id: courses[0].id }],
    },
    {
      id: "visitors",
      name: "Visitors",
      teamIds: ["sales-team"],
      learningItems: [
        { kind: "curriculum", id: "intro" },
        { kind: "course", id: courses[0].id },
      ],
    },
    {
      id: "account",
      name: "Account group",
      learningItems: [{ kind: "course", id: courses[2].id }],
    },
  ];
  data.curricula = [
    {
      id: "intro",
      name: "Guest introduction",
      description: "Two courses to get started.",
      status: "published",
      courseIds: [courses[0].id, courses[1].id],
    },
  ];
  data.settings = { ...defaultSettings, guestGroupId: "visitors" };
  data.users = data.users.map((u) => ({
    ...u,
    groups: ["account"],
    teamId: undefined,
    onboardingStart: undefined,
  }));
  data.progress = {};
  data.revision = 1;
  data.governanceRevision = 1;
  return reconcileLearning(before, data, "2020-01-01T00:00:00.000Z");
}
