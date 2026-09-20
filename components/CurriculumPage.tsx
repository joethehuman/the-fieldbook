import type { Content, Curriculum, Progress } from "@/lib/types";
import { curriculumCourses, curriculumProgress } from "@/lib/learning-cards";
import { courseProgress } from "@/lib/course-progress";
import { PageHeader, EmptyState, SectionHeader } from "./patterns/layout";
import { LaunchList } from "./patterns/launch-list";
import { Button } from "./ui/button";
import { ProgressStatus } from "./ui/progress";
export function CurriculumPage({
  curriculum,
  courses,
  progress,
  onBack,
  onOpen,
}: {
  curriculum: Curriculum;
  courses: Content[];
  progress: Progress[];
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const items = curriculumCourses(curriculum, courses);
  const status = curriculumProgress(items, progress);
  const next = items.find((c) => !courseProgress(c, progress).complete);
  return (
    <div className="grid w-full max-w-3xl gap-6">
      <PageHeader>
        <Button variant="link" className="justify-self-start" onClick={onBack}>
          ← Back to courses
        </Button>
        <span className="eyebrow">Curriculum</span>
        <h1>{curriculum.name}</h1>
        <p>{curriculum.description}</p>
      </PageHeader>
      <SectionHeader
        title={
          <ProgressStatus
            value={status.percent}
            complete={status.complete}
            started={status.started}
          />
        }
        description={`${status.completed} of ${items.length} courses complete`}
      >
        {next && (
          <Button onClick={() => onOpen(next.id)}>
            {status.started ? "Continue curriculum" : "Start curriculum"}
          </Button>
        )}
      </SectionHeader>
      <LaunchList
        items={items.map((c) => {
          const s = courseProgress(c, progress);
          return {
            id: c.id,
            title: c.title,
            description: `${c.lessons.length} lessons · ${c.duration} min`,
            status: (
              <ProgressStatus
                value={s.percent}
                complete={s.complete}
                started={s.started}
              />
            ),
            action: s.complete
              ? "Review course"
              : s.started
                ? "Continue course"
                : "Start course",
            onClick: () => onOpen(c.id),
          };
        })}
      />
      {!items.length && (
        <EmptyState>
          No courses are available in this curriculum yet.
        </EmptyState>
      )}
    </div>
  );
}
