import type { Progress } from "./types";
export type GuestProgress = Progress & { guestAnswers?: number[] };
export function guestAnswersForImport(
  previous: GuestProgress | undefined,
  answers: number[] | undefined,
  passed: boolean | undefined,
): number[] | undefined {
  if (answers && (passed || !previous?.guestAnswers)) return answers;
  return previous?.guestAnswers;
}
