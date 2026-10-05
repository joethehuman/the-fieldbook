"use client";

import { useEffect, useState } from "react";
import { CourseCard } from "@/components/CourseCard";
import { CurriculumCard } from "@/components/CurriculumCard";
import { courseProgress } from "@/lib/course-progress";
import { addDays, todayUTC } from "@/lib/learning";
import type { Content, Curriculum, Progress } from "@/lib/types";

const course: Content = {
  id: "catalog-example-course",
  kind: "course",
  title: "Example course",
  summary: "Shared spacing, readable descriptions and aligned actions.",
  body: "",
  category: "Product",
  folder: "",
  status: "published",
  version: 1,
  updatedAt: "2026-09-28T12:00:00.000Z",
  duration: 5,
  groups: [],
  lessons: [
    { id: "catalog-lesson-1", title: "First lesson", body: "" },
    { id: "catalog-lesson-2", title: "Second lesson", body: "" },
  ],
  questions: [
    {
      id: "catalog-question",
      prompt: "Example question",
      options: ["Yes", "No"],
      answer: 0,
    },
  ],
};

const completedCourse: Content = {
  ...course,
  id: "catalog-completed-course",
};
const curriculumCourses: Content[] = [
  completedCourse,
  { ...course, id: "catalog-curriculum-course-2" },
  { ...course, id: "catalog-curriculum-course-3" },
];
const curriculum: Curriculum = {
  id: "catalog-curriculum",
  name: "A longer curriculum title that wraps naturally",
  description: course.summary,
  courseIds: curriculumCourses.map((item) => item.id),
  status: "published",
};
const progress: Progress[] = [
  {
    content_id: completedCourse.id,
    version: completedCourse.version,
    lessons: completedCourse.lessons.map((lesson) => lesson.id),
    passed: true,
  },
];

export function LearningCardExamples() {
  const [pastDueDate, setPastDueDate] = useState<string>();
  useEffect(() => setPastDueDate(addDays(todayUTC(), -2)), []);

  return (
    <>
      <CourseCard
        course={course}
        status={courseProgress(course, [])}
        assignmentLabel="Assigned"
        dueDate={pastDueDate}
        pastDue
      />
      <CurriculumCard
        curriculum={curriculum}
        courses={curriculumCourses}
        progress={progress}
        assignmentLabel="Assigned"
      />
      <CourseCard
        course={completedCourse}
        status={courseProgress(completedCourse, progress)}
      />
    </>
  );
}
