import type { Content, Question } from "./types";

export type QuizAnswers = number[][];

export function optionIds(question: Question) {
  return question.optionIds?.length === question.options.length
    ? question.optionIds
    : question.options.map((_, index) => `${question.id}:${index}`);
}

export function correctOptionIds(question: Question) {
  return question.correctOptionIds?.length
    ? question.correctOptionIds
    : question.answer === undefined
      ? []
      : [optionIds(question)[question.answer]];
}

export function requiresPassing(course: Content) {
  return course.requirePassing ?? true;
}

export function validQuestion(question: Question) {
  const ids = optionIds(question);
  const correct = correctOptionIds(question);
  return !!question.prompt.trim() &&
    question.options.length >= 2 && question.options.length <= 5 &&
    question.options.every((option) => !!option.trim()) &&
    ids.length === new Set(ids).size &&
    correct.length >= 1 && correct.length <= 4 &&
    correct.length < ids.length &&
    correct.every((id) => ids.includes(id)) &&
    correct.length === new Set(correct).size;
}

export function gradeQuiz(course: Content, answers: QuizAnswers) {
  if (!course.questions.length || answers.length !== course.questions.length)
    throw new Error("Answer every quiz question.");
  const items = course.questions.map((question, index) => {
    const ids = optionIds(question);
    const selected = answers[index];
    if (!Array.isArray(selected) || !selected.length ||
      selected.some((value) => !Number.isInteger(value) || value < 0 || value >= ids.length) ||
      new Set(selected).size !== selected.length)
      throw new Error("Choose an answer for every question.");
    const choices = selected.map((value) => ids[value]);
    const correct = correctOptionIds(question);
    return {
      questionId: question.id,
      optionIds: choices,
      correct: choices.length === correct.length && choices.every((id) => correct.includes(id)),
    };
  });
  return { passed: items.every((item) => item.correct), answers: items };
}

export function quizUnlocked(course: Content, attempts: { passed: boolean }[] = []) {
  return !course.questions.length || attempts.some((attempt) =>
    requiresPassing(course) ? attempt.passed : true,
  );
}
