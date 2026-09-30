import type { Content } from "../../lib/types";

// Model tests own their answer contract instead of depending on demo editorial copy.
export function withTwoQuestionQuiz(course: Content): Content {
  return {
    ...course,
    requirePassing: true,
    questions: [
      {
        id: "test-question-1",
        prompt: "Choose A",
        options: ["A", "B", "C"],
        answer: 0,
      },
      {
        id: "test-question-2",
        prompt: "Choose B",
        options: ["A", "B", "C"],
        answer: 1,
      },
    ],
  };
}
