import type { Progress } from "./types";
import type { QuizAnswers } from "./course-quiz";
export type GuestProgress = Progress & { guestAnswers?: number[]; guestSelections?: QuizAnswers };
export function guestAnswersForImport(
  previous: GuestProgress | undefined,
  answers: number[] | undefined,
  passed: boolean | undefined,
): number[] | undefined {
  if (answers && (passed || !previous?.guestAnswers)) return answers;
  return previous?.guestAnswers;
}
export function guestSelectionsForImport(
  previous: GuestProgress | undefined,
  selections: QuizAnswers | undefined,
  passed: boolean | undefined,
): QuizAnswers | undefined {
  if (selections && (passed || !previous?.guestSelections)) return selections;
  return previous?.guestSelections;
}
