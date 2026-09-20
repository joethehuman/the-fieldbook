import { useState } from "react";
import { Play, CheckCircle2, ArrowUpRight } from "lucide-react";
import type { Content } from "@/lib/types";
export function CourseCard({
  course: c,
  complete,
  dueDate,
  progress = 0,
  onClick,
}: {
  course: Content;
  complete: boolean;
  dueDate?: string;
  progress?: number;
  onClick: () => void;
}) {
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const showCover = !!c.coverImageUrl && c.coverImageUrl !== failedCover;
  const index = Number(c.id.replace(/\D/g, "")) || 1;
  return (
    <button className="course-card" onClick={onClick}>
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
          {complete ? (
            <span className="completed">
              <CheckCircle2 size={13} />
              Completed
            </span>
          ) : progress ? (
            <span className="in-progress">In progress</span>
          ) : (
            <span>{c.lessons.length} lessons · Quiz</span>
          )}
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
        <div className="course-bottom">
          <span>
            {complete
              ? "Review course"
              : progress
                ? "Continue course"
                : "Start course"}
          </span>
          <ArrowUpRight size={17} />
        </div>
      </div>
    </button>
  );
}
