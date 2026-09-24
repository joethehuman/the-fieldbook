import { LearningCard } from "./patterns/learning-card";

import type { courseProgress } from "@/lib/course-progress";

import { useState } from "react";
import { Play } from "lucide-react";
import type { Content } from "@/lib/types";
export function CourseCard({
  course: c,
  status,
  dueDate,
  onClick,
  href,
}: {
  course: Content;
  status: ReturnType<typeof courseProgress>;
  dueDate?: string;
  onClick?: () => void;
  href?: string;
}) {
  const { complete, started } = status;
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const showCover = !!c.coverImageUrl && c.coverImageUrl !== failedCover;
  const index = Number(c.id.replace(/\D/g, "")) || 1;
  return (
    <LearningCard
      onClick={onClick}
      href={href}
      title={c.title}
      description={c.summary}
      status={status}
      metadata={`${c.lessons.length} lessons · Quiz`}
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
        <div
          className={
            "course-art art-" + (index % 6) + (showCover ? " has-cover" : "")
          }
        >
          {showCover ? (
            <img
              className="course-cover"
              src={c.coverImageUrl}
              alt=""
              loading="lazy"
              onError={() => setFailedCover(c.coverImageUrl || null)}
            />
          ) : (
            <div className="art-grid" />
          )}
          <span className="art-label">{c.category}</span>
          {!showCover && (
            <div className={"abstract abstract-" + (index % 3)}>
              <i />
              <i />
              <i />
            </div>
          )}
          <span className="play-disc">
            <Play size={17} fill="currentColor" />
          </span>
          <span className="duration">{c.duration} min</span>
        </div>
      }
    />
  );
}
