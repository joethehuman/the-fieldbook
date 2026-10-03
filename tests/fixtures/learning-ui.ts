import { freshWorkspace } from "../../lib/store";
import { withTwoQuestionQuiz } from "./quiz";

// These interaction tests own a small curriculum, independent of demo editorial data.
export function learningUiFixture(data = freshWorkspace()) {
  const titles = [
    "Start with the customer",
    "Know the platform",
    "From discovery to next steps",
  ];
  data.content = data.content.map((item) => {
    if (item.kind !== "course") return item;
    const index = ["course-1", "course-2", "course-3"].indexOf(item.id);
    if (index < 0) return { ...item, groups: [], assignments: [] };
    const course = withTwoQuestionQuiz(item);
    return {
      ...course,
      title: titles[index],
      category: "Sales foundations",
      groups: ["sales"],
      assignments: undefined,
      lessons: course.lessons.slice(0, 2).map((lesson, index) => ({
        ...lesson,
        title: index === 0 ? "The big idea" : "Put it into practice",
      })),
      questions: course.questions.map((question, questionIndex) => ({
        ...question,
        prompt:
          questionIndex === 0
            ? "What should guide the conversation?"
            : "How should a useful conversation end?",
        options:
          questionIndex === 0
            ? [
                "The customer’s goal",
                "Every available feature",
                "The feature list",
              ]
            : [
                "Without agreement",
                "With an agreed next step",
                "Without a plan",
              ],
      })),
    };
  });
  data.curricula = [
    {
      id: "sales-foundations",
      name: "Account executive foundations",
      description: "Synthetic interaction fixture.",
      status: "published",
      courseIds: ["course-1", "course-2", "course-3"],
    },
  ];
  data.groups = data.groups.map((group) => ({
    ...group,
    requiredCourseIds:
      group.id === "sales" ? ["course-1", "course-2", "course-3"] : [],
    learningItems:
      group.id === "sales"
        ? [{ kind: "curriculum" as const, id: "sales-foundations" }]
        : [],
  }));
  const first = data.content.find((item) => item.id === "course-1")!;
  data.progress["demo-learner"] = [
    {
      content_id: first.id,
      version: first.version,
      lessons: first.lessons.map((lesson) => lesson.id),
      passed: true,
    },
  ];
  return data;
}
