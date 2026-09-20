import { CardFooter } from "./patterns/layout";
import { ProgressStatus } from "./ui/progress";
import type { courseProgress } from "@/lib/course-progress";
import { ContentAction } from "@/components/patterns/content-action";
import { useState } from "react";
import { Play, ArrowUpRight } from "lucide-react";
import type { Content } from "@/lib/types";
export function CourseCard({
  course: c,
  status,
  dueDate,
  onClick,
}: {
  course: Content;
  status: ReturnType<typeof courseProgress>;
  dueDate?: string;
  onClick: () => void;
}) {
  const { complete, started, percent } = status;
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const showCover = !!c.coverImageUrl && c.coverImageUrl !== failedCover;
  const index = Number(c.id.replace(/\D/g, "")) || 1;
  return (
    <ContentAction focusRing="inside" className="course-card" onClick={onClick}>
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
      <div className="course-copy">
        <div className="course-meta">
          <span>{c.lessons.length} lessons · Quiz</span>
          <ProgressStatus
            value={percent}
            complete={complete}
            started={started}
          />
        </div>
        <h3>{c.title}</h3>
        {dueDate && !complete && (
          <small
            className={
              dueDate < new Date().toISOString().slice(0, 10)
                ? "deadline overdue"
                : "deadline"
            }
          >
            {dueDate < new Date().toISOString().slice(0, 10)
              ? "Overdue · "
              : "Due "}
            {dueDate}
          </small>
        )}
        <p>{c.summary}</p>
        <CardFooter
          action={
            <>
              {complete
                ? "Review course"
                : started
                  ? "Continue course"
                  : "Start course"}
              <ArrowUpRight size={17} />
            </>
          }
        />
      </div>
    </ContentAction>
  );
}
