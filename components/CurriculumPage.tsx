import type { Content, Curriculum, Progress } from "@/lib/types";
import { curriculumCourses } from "@/lib/learning-cards";
import { courseProgress } from "@/lib/course-progress";
import { PageHeader, EmptyState } from "./patterns/layout";
import { CardGrid } from "./patterns/learning-card";
import { CourseCard } from "./CourseCard";
import { Button } from "./ui/button";
import Link from "next/link";
export function CurriculumPage({
  curriculum,
  courses,
  progress,
  onBack,
  onOpen,
  backLabel = "Back to courses",
  backHref,
  courseHref,
}: {
  curriculum: Curriculum;
  courses: Content[];
  progress: Progress[];
  onBack: () => void;
  onOpen: (id: string) => void;
  backLabel?: string;
  backHref?: string;
  courseHref?: (id: string) => string;
}) {
  const items = curriculumCourses(curriculum, courses);
  return (
    <div className="grid w-full gap-6">
      <PageHeader>
        {backHref ? <Button asChild variant="link" className="justify-self-start"><Link href={backHref}>← {backLabel}</Link></Button> : <Button variant="link" className="justify-self-start" onClick={onBack}>← {backLabel}</Button>}
        <span className="eyebrow">Curriculum</span>
        <h1>{curriculum.name}</h1>
        <p>{curriculum.description}</p>
      </PageHeader>
      <CardGrid>{items.map((course) => <CourseCard key={course.id} course={course} status={courseProgress(course, progress)} href={courseHref?.(course.id)} onClick={courseHref ? undefined : () => onOpen(course.id)} />)}</CardGrid>
      {!items.length && (
        <EmptyState>
          No courses are available in this curriculum yet.
        </EmptyState>
      )}
    </div>
  );
}
