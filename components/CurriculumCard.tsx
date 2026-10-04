import { BookOpen } from "lucide-react";
import { CardArtwork } from "./patterns/card-artwork";
import type { SiteSettings } from "@/lib/settings";
import type { Content, Curriculum, Progress } from "@/lib/types";
import { curriculumProgress } from "@/lib/learning-cards";
import { LearningCardFact, LearningCard } from "./patterns/learning-card";
export function CurriculumCard({
  curriculum,
  courses,
  progress,
  onClick,
  href,
  settings,
  assignmentLabel,
  pastDue = false,
}: {
  curriculum: Curriculum;
  courses: Content[];
  progress: Progress[];
  onClick?: () => void;
  href?: string;
  settings?: SiteSettings;
  assignmentLabel?: "Assigned" | "Recommended";
  pastDue?: boolean;
}) {
  const status = curriculumProgress(courses, progress);
  return (
    <LearningCard
      title={curriculum.name}
      description={curriculum.description}
      status={status}
      metadata={
        <LearningCardFact icon={BookOpen}>
          {status.completed} of {courses.length}{" "}
          {courses.length === 1 ? "course" : "courses"} complete
        </LearningCardFact>
      }
      action="View curriculum"
      onClick={onClick}
      href={href}
      artwork={
        <CardArtwork
          id={curriculum.id}
          title={curriculum.name}
          kind="curriculum"
          relevance={
            assignmentLabel
              ? pastDue && assignmentLabel === "Assigned" && !status.complete
                ? "Past due"
                : "For you"
              : undefined
          }
          art={curriculum.cardArt}
          settings={settings}
        />
      }
    />
  );
}
