import { LearningCard } from "./patterns/learning-card";

import type { courseProgress } from "@/lib/course-progress";

import { CardArtwork } from "./patterns/card-artwork";
import type { SiteSettings } from "@/lib/settings";
import type { Content } from "@/lib/types";
export function CourseCard({
  course: c,
  status,
  dueDate,
  assigned = false,
  onClick,
  href,
  settings,
}: {
  course: Content;
  status: ReturnType<typeof courseProgress>;
  dueDate?: string;
  assigned?: boolean;
  onClick?: () => void;
  href?: string;
  settings?: SiteSettings;
}) {
  const { complete, started } = status;
  return (
    <LearningCard
      onClick={onClick}
      href={href}
      title={c.title}
      description={c.summary}
      status={status}
      metadata={`${c.category} · ${c.duration} min · ${c.lessons.length} lessons${c.questions.length ? " · Quiz" : ""}${assigned ? " · Assigned" : ""}`}
      action={
        complete
          ? "Review course"
          : started
            ? "Continue course"
            : "Start course"
      }
      detail={
        dueDate && !complete ? (
          <small className="text-muted-foreground">Due {dueDate}</small>
        ) : undefined
      }
      artwork={
        <CardArtwork
          id={c.id}
          title={c.title}
          kind="course"
          category={c.category}
          art={c.cardArt}
          legacyCover={c.coverImageUrl}
          settings={settings}
        />
      }
    />
  );
}
