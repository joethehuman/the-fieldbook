import type { Question } from "@/lib/types";
import { gradeQuiz } from "@/lib/course-quiz";
import { seedContent } from "@/lib/seed";

// Synthetic catalog examples. Never inserted into a browser workspace or an installation.
const questions: Question[] = [
  {
    id: "review-1",
    prompt: "A customer asks whether an unreleased feature will be available next month. What should you say?",
    options: [
      "Explain what is available today, then confirm the planned timing with the product owner before making a commitment.",
      "Tell them it will arrive next month because it was mentioned in the planning meeting.",
      "Avoid discussing the feature at all.",
    ],
    answer: 0,
    explanation: "A planning discussion is not a confirmed release commitment. Separate current capability from plans that still need confirmation.",
  },
  {
    id: "review-2",
    prompt: "What should guide the first conversation with a customer?",
    options: ["The outcome they need to achieve.", "Every available feature.", "The length of the presentation."],
    answer: 0,
  },
  {
    id: "review-3",
    prompt: "Where should the current decision and its owner be recorded?",
    options: ["In the maintained shared record.", "Only in your personal notes.", "In a new message each time someone asks."],
    answer: 0,
  },
  {
    id: "review-4",
    prompt: "You realize a file containing customer details went to the wrong recipient. What should happen first?",
    options: [
      "Report the incident promptly through the approved internal channel and follow the response guidance.",
      "Delete your sent message and assume the problem is gone.",
      "Wait to see whether the recipient mentions it.",
    ],
    answer: 0,
    explanation: "Prompt reporting gives the response owner a chance to contain the problem. Deleting your copy does not remove the recipient’s copy.",
  },
  {
    id: "review-5",
    prompt: "A discovery meeting ends with several open questions. What makes the follow-up useful?",
    options: [
      "Summarize the agreed goal, name an owner for each open question, and confirm when the customer will hear from you again.",
      "Send the full presentation without a next step.",
      "Wait until every answer is available before responding.",
    ],
    answer: 0,
  },
  {
    id: "review-6",
    prompt: "Which two details belong in a handoff to another team?",
    options: [
      "The current situation and the outcome the customer needs.",
      "Every internal conversation, regardless of relevance.",
      "The next action, its owner, and the agreed timing.",
    ],
    correctOptionIds: ["review-6:0", "review-6:2"],
    multiple: true,
    explanation: "A useful handoff gives the receiving team enough context to act and makes the next responsibility clear.",
  },
  {
    id: "review-7",
    prompt: "Which source should a teammate use for the current process?",
    options: ["The maintained reference page.", "An old screenshot of the process.", "Whichever message is easiest to find."],
    answer: 0,
  },
  {
    id: "review-8",
    prompt: "Two internal pages disagree about an approval step. What is the best next action?",
    options: [
      "Check with the process owner, clarify the current rule, and update the maintained reference.",
      "Copy both versions into a third page so everyone can decide for themselves.",
      "Choose the version with fewer steps.",
    ],
    answer: 0,
    explanation: "Resolve the disagreement at its source. Another copy makes the uncertainty harder to untangle.",
  },
  {
    id: "review-9",
    prompt: "A customer has agreed on the next step, but the implementation team has not yet confirmed who can attend. The customer asks you to send a calendar invitation today. How should you keep the work moving without presenting an unconfirmed plan as settled?",
    options: [
      "Acknowledge the agreed next step, explain that the implementation owner is still being confirmed, and give the customer a specific time for your next update. Check availability with the team before sending an invitation that implies their attendance is confirmed.",
      "Invite several people and assume one of them will attend.",
      "Say nothing until the team replies.",
    ],
    answer: 0,
  },
  {
    id: "review-10",
    prompt: "You find an outdated instruction in a shared guide. What should you do?",
    options: [
      "Flag it to the owner with the specific correction and enough context to verify it.",
      "Work around it without telling anyone.",
      "Create a private replacement guide.",
    ],
    answer: 0,
  },
];

export function quizReviewExample(count: number, allCorrect: boolean) {
  const selectedQuestions = questions.slice(0, count);
  const choices = selectedQuestions.map((question, index) =>
    !allCorrect && [0, 3, 7].includes(index) ? [1] : question.multiple ? [0, 2] : [0],
  );
  const course = { ...seedContent.find(item => item.kind === "course")!, questions: selectedQuestions };
  return { questions: selectedQuestions, ...gradeQuiz(course, choices) };
}
