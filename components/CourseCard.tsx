import { Clock3, BookOpen, ListChecks } from "lucide-react";
import { LearningCardFact, LearningCard } from "./patterns/learning-card";

import type { courseProgress } from "@/lib/course-progress";

import { CardArtwork } from "./patterns/card-artwork";
import type { SiteSettings } from "@/lib/settings";
import type { Content } from "@/lib/types";
export function CourseCard({
  course: c,
  status,
  dueDate,
  assignmentLabel,
  pastDue = false,
  onClick,
  href,
  settings,
}: {
  course: Content;
  status: ReturnType<typeof courseProgress>;
  dueDate?: string;
  assignmentLabel?: "Assigned" | "Recommended";
  pastDue?: boolean;
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
      metadata={
        <>
          <LearningCardFact icon={Clock3}>{c.duration} min</LearningCardFact>
          <LearningCardFact icon={BookOpen}>
            {c.lessons.length} {c.lessons.length === 1 ? "lesson" : "lessons"}
          </LearningCardFact>
          {!!c.questions.length && (
            <LearningCardFact icon={ListChecks}>Quiz</LearningCardFact>
          )}
        </>
      }
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
          relevance={
            assignmentLabel
              ? pastDue && assignmentLabel === "Assigned" && !complete
                ? "Past due"
                : "For you"
              : undefined
          }
          art={c.cardArt}
          legacyCover={c.coverImageUrl}
          settings={settings}
        />
      }
    />
  );
}
