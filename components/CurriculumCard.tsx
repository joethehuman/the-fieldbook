import { Layers } from "lucide-react";
import type { Content, Curriculum, Progress } from "@/lib/types";
import { curriculumProgress } from "@/lib/learning-cards";
import { LearningCard } from "./patterns/learning-card";
export function CurriculumCard({
  curriculum,
  courses,
  progress,
  onClick,
}: {
  curriculum: Curriculum;
  courses: Content[];
  progress: Progress[];
  onClick: () => void;
}) {
  const status = curriculumProgress(courses, progress);
  return (
    <LearningCard
      title={curriculum.name}
      description={curriculum.description}
      status={status}
      metadata={`${status.completed} of ${courses.length} courses complete`}
      action="View curriculum"
      onClick={onClick}
      artwork={
        <div className="course-art art-1">
          <div className="art-grid" />
          <span className="art-label">Curriculum</span>
          <div className="abstract abstract-1">
            <i />
            <i />
            <i />
          </div>
          <span className="play-disc">
            <Layers size={17} />
          </span>
        </div>
      }
    />
  );
}
