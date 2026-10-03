import type { LearningCollection } from "./course-progress";
export type LearningView = "home" | "curricula" | LearningCollection;
export const courseViewPaths: Record<LearningView, string> = {
  home: "/courses",
  yours: "/courses/yours",
  assigned: "/courses/for-you",
  "in-progress": "/courses/in-progress",
  completed: "/courses/completed",
  all: "/courses/all",
  curricula: "/courses/curricula",
};
export function courseLibraryView(path: string): LearningView | undefined {
  return (Object.keys(courseViewPaths) as LearningView[]).find(
    (view) => courseViewPaths[view] === path,
  );
}
