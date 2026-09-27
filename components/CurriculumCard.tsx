import { CardArtwork } from "./patterns/card-artwork";
import type { SiteSettings } from "@/lib/settings";
import type { Content, Curriculum, Progress } from "@/lib/types";
import { curriculumProgress } from "@/lib/learning-cards";
import { LearningCard } from "./patterns/learning-card";
export function CurriculumCard({
  curriculum,
  courses,
  progress,
  onClick,
  href,
  settings,
}: {
  curriculum: Curriculum;
  courses: Content[];
  progress: Progress[];
  onClick?: () => void;
  href?: string;
  settings?: SiteSettings;
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
      href={href}
      artwork={
        <CardArtwork
          id={curriculum.id}
          title={curriculum.name}
          kind="curriculum"
          art={curriculum.cardArt}
          settings={settings}
        />
      }
    />
  );
}
