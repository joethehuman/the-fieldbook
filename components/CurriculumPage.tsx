import { sortLabels } from "@/lib/collection-sort";
import { SortPicker } from "./patterns/sort-picker";
import { useState } from "react";
import type { Content, Curriculum, Progress, User, Group } from "@/lib/types";
import type { SiteSettings } from "@/lib/settings";
import { learningState, learningTarget } from "@/lib/learning";
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
  user,
  groups = [],
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
  user?: User;
  groups?: Group[];
}) {
  const [sort, setSort] = useState("recommended");
  const items = curriculumCourses(curriculum, courses);
  const learning = user
    ? learningState(items, user, groups, progress, settings)
    : undefined;
  const assignedIds = new Set(learning?.required.map((c) => c.id));
  const overdueIds = new Set(learning?.overdue.map((c) => c.id));
  if (sort !== "recommended")
    items.sort((a, b) =>
      (sort === "title-desc" ? -1 : 1) * a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
    );
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
      <SortPicker label="Sort courses" value={sort} onValueChange={setSort}>
        <option value="recommended">Recommended order</option>
        <option value="title">{sortLabels.titleAsc}</option>
        <option value="title-desc">{sortLabels.titleDesc}</option>
      </SortPicker>
      <CardGrid>
        {items.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            settings={settings}
            status={courseProgress(course, progress)}
            dueDate={
              user && assignedIds.has(course.id)
                ? learningTarget(course, user, groups, settings)
                : undefined
            }
            assignmentLabel={
              assignedIds.has(course.id)
                ? user?.id === "guest" || settings?.dueDatesEnabled === false
                  ? "Recommended"
                  : "Assigned"
                : undefined
            }
            pastDue={overdueIds.has(course.id)}
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
