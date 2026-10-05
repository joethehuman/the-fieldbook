"use client";

import { useEffect, useState } from "react";

import { CourseCard } from "@/components/CourseCard";
import { CurriculumCard } from "@/components/CurriculumCard";
import { courseProgress } from "@/lib/course-progress";
import { addDays, todayUTC } from "@/lib/learning";
import type { Content, Curriculum, Progress } from "@/lib/types";

const course: Content = {
  id: "card-preview-course",
  kind: "course",
  title: "Responsible AI, Pending Review",
  summary:
    "Use approved AI tools thoughtfully, protect information, and verify outputs before relying on them.",
  body: "",
  category: "Trust and Customer Readiness",
  folder: "",
  status: "published",
  version: 1,
  updatedAt: "2026-09-28T12:00:00.000Z",
  duration: 5,
  groups: [],
  lessons: [
    { id: "preview-lesson-1", title: "Know what may be shared", body: "" },
    { id: "preview-lesson-2", title: "Check the output", body: "" },
    { id: "preview-lesson-3", title: "Keep a person accountable", body: "" },
  ],
  questions: [
    {
      id: "preview-question",
      prompt: "What should you do before using an AI output?",
      options: ["Verify it", "Trust it"],
      answer: 0,
    },
  ],
  cardArt: {
    source: "generated",
    shortTitle: "Responsible AI, Pending Review",
    version: 6,
    seed: 0,
  },
};

const curriculum: Curriculum = {
  id: "card-preview-curriculum",
  name: "Trust and Customer Readiness",
  description:
    "A practical path through the courses that support confident customer conversations.",
  courseIds: [course.id],
  status: "published",
  cardArt: {
    source: "generated",
    shortTitle: "Trust and Customer Readiness",
    version: 6,
    seed: 1500,
  },
};

const progress: Progress[] = [
  {
    content_id: course.id,
    version: course.version,
    lessons: [course.lessons[0].id],
    passed: false,
  },
];

export default function CourseCardCatalog() {
  const [dueDate, setDueDate] = useState<string>();
  useEffect(() => setDueDate(addDays(todayUTC(), 6)), []);
  const status = courseProgress(course, progress);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:px-8">
      <header className="grid max-w-3xl gap-3">
        <span className="eyebrow">Component catalog</span>
        <h1 className="text-3xl font-semibold tracking-tight">
          Learning cards
        </h1>
        <p className="text-muted-foreground">
          Course descriptions sit between the title and anchored facts. The due
          cue appears only on unfinished assigned courses. Curriculum wrappers
          retain For you without a course deadline.
        </p>
      </header>
      <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <section className="grid max-w-[320px] gap-2">
          <CourseCard
            course={course}
            status={status}
            assignmentLabel="Assigned"
            dueDate={dueDate}
          />
          <h2 className="text-xs text-muted-foreground">
            Assigned course · due in 6 days
          </h2>
        </section>
        <section className="grid max-w-[320px] gap-2">
          <CourseCard course={course} status={status} />
          <h2 className="text-xs text-muted-foreground">
            Course without a due date
          </h2>
        </section>
        <section className="grid max-w-[320px] gap-2">
          <CurriculumCard
            curriculum={curriculum}
            courses={[course]}
            progress={progress}
            assignmentLabel="Assigned"
          />
          <h2 className="text-xs text-muted-foreground">Curriculum wrapper</h2>
        </section>
      </div>
    </main>
  );
}
