import { useState } from "react";
import { FormField } from "./patterns/form-field";
import { SelectField } from "./ui/select";
import type { Content, Curriculum, Progress } from "@/lib/types";
import type { SiteSettings } from "@/lib/settings";
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
  settings,
  progress,
  onBack,
  onOpen,
  backLabel = "Back to courses",
  backHref,
  courseHref,
}: {
  curriculum: Curriculum;
  courses: Content[];
  settings?: SiteSettings;
  progress: Progress[];
  onBack: () => void;
  onOpen: (id: string) => void;
  backLabel?: string;
  backHref?: string;
  courseHref?: (id: string) => string;
}) {
  const [sort, setSort] = useState("recommended");
  const items = curriculumCourses(curriculum, courses);
  if (sort !== "recommended")
    items.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      const aDate = sort === "added" ? a.createdAt || a.updatedAt : a.updatedAt;
      const bDate = sort === "added" ? b.createdAt || b.updatedAt : b.updatedAt;
      return (
        (sort === "oldest" ? 1 : -1) * aDate.localeCompare(bDate) ||
        a.title.localeCompare(b.title)
      );
    });
  return (
    <div className="grid w-full gap-6">
      <PageHeader>
        {backHref ? (
          <Button asChild variant="link" className="justify-self-start">
            <Link href={backHref}>← {backLabel}</Link>
          </Button>
        ) : (
          <Button
            variant="link"
            className="justify-self-start"
            onClick={onBack}
          >
            ← {backLabel}
          </Button>
        )}
        <span className="eyebrow">Curriculum</span>
        <h1>{curriculum.name}</h1>
        <p>{curriculum.description}</p>
      </PageHeader>
      <FormField label="Sort courses">
        <SelectField value={sort} onValueChange={setSort}>
          <option value="recommended">Recommended order</option>
          <option value="added">Newest courses first</option>
          <option value="title">Title A–Z</option>
          <option value="updated">Recently updated</option>
          <option value="oldest">Oldest update first</option>
        </SelectField>
      </FormField>
      <CardGrid>
        {items.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            settings={settings}
            status={courseProgress(course, progress)}
            href={courseHref?.(course.id)}
            onClick={courseHref ? undefined : () => onOpen(course.id)}
          />
        ))}
      </CardGrid>
      {!items.length && (
        <EmptyState>
          No courses are available in this curriculum yet.
        </EmptyState>
      )}
    </div>
  );
}
