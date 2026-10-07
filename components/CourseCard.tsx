import { Clock3, BookOpen, CalendarDays, ListChecks } from "lucide-react";
import { LearningCardFact, LearningCard } from "./patterns/learning-card";

import type { courseProgress } from "@/lib/course-progress";

import { CardArtwork } from "./patterns/card-artwork";
import { todayUTC } from "@/lib/learning";
import type { SiteSettings } from "@/lib/settings";
import type { Content } from "@/lib/types";
import { cn } from "@/lib/utils";

function dueLabel(dueDate: string) {
  const target = Date.parse(`${dueDate}T00:00:00Z`);
  if (!Number.isFinite(target)) return undefined;
  const today = Date.parse(`${todayUTC()}T00:00:00Z`);
  const days = Math.round((target - today) / 86_400_000);
  const count = Math.abs(days);
  const unit = count === 1 ? "day" : "days";
  return {
    text:
      days === 0
        ? "Due today"
        : days > 0
          ? `Due in ${count} ${unit}`
          : `${count} ${unit} past due`,
    pastDue: days < 0,
  };
}

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
  const visibleDueDate =
    !complete &&
    assignmentLabel === "Assigned" &&
    settings?.dueDatesEnabled !== false
      ? dueDate
      : undefined;
  const dueText = visibleDueDate ? dueLabel(visibleDueDate) : undefined;
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
        dueText ? (
          <time
            dateTime={visibleDueDate}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium",
              dueText.pastDue ? "text-destructive" : "text-muted-foreground",
            )}
          >
            <CalendarDays size={14} strokeWidth={1.6} aria-hidden="true" />
            {dueText.text}
          </time>
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
