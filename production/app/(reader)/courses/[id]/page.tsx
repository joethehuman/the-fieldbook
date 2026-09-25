import { notFound } from "next/navigation";
import {
  readerCourseItem,
  readerCourseProgress,
  readerMetadata,
} from "@production/lib/reader";
import { CourseOverview, ReadingBack } from "@/components/patterns/reading";
import { ReaderCoursePlayer } from "@/components/reader/ReaderCoursePlayer";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lesson?: string; curriculum?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const { item, context } = await readerCourseItem(id);
  return readerMetadata(item, context);
}

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const { lesson, curriculum } = await searchParams;
  const [{ item, context }, progress] = await Promise.all([
    readerCourseItem(id),
    lesson ? readerCourseProgress(id) : Promise.resolve([]),
  ]);
  if (lesson) {
    if (!item.lessons.some((entry) => entry.id === lesson)) notFound();
    return (
      <ReaderCoursePlayer
        course={item}
        lessonId={lesson}
        curriculum={curriculum}
        signedIn={!!context.user}
        initialProgress={progress.filter(
          (entry) => entry.version === item.version,
        )}
      />
    );
  }
  return (
    <CourseOverview
      item={item}
      curriculum={curriculum}
      lessonBase="/courses"
      back={
        <ReadingBack kind="course" curriculum={curriculum} clientNavigation />
      }
    />
  );
}
