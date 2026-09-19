export type Lesson = {
  id: string;
  title: string;
  body: string;
  videoUrl?: string;
};
export type Question = {
  id: string;
  prompt: string;
  options: string[];
  answer?: number;
};
export type Content = {
  id: string;
  kind: "doc" | "brief" | "course";
  title: string;
  summary: string;
  body: string;
  category: string;
  folder: string;
  status: "draft" | "published";
  version: number;
  updatedAt: string;
  duration: number;
  groups: string[];
  lessons: Lesson[];
  questions: Question[];
};
export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "learner";
  groups: string[];
  active: boolean;
};
export type Progress = {
  content_id: string;
  version: number;
  lessons: string[];
  passed: boolean;
};
export type Group = { id: string; name: string };
export type Snapshot = {
  user: User;
  content: Content[];
  progress: Progress[];
  groups: Group[];
  users?: User[];
  report?: {
    user_id: string;
    content_id: string;
    version: number;
    passed: boolean;
  }[];
};
export function isComplete(course: Content, progress: Progress[]) {
  const p = progress.find(
    (p) => p.content_id === course.id && p.version === course.version,
  );
  return (
    !!p && p.passed && course.lessons.every((l) => p.lessons.includes(l.id))
  );
}
export function assignedCourses(content: Content[], user: User) {
  return content.filter(
    (c) =>
      c.kind === "course" &&
      c.status === "published" &&
      c.groups.some((g) => user.groups.includes(g)),
  );
}
