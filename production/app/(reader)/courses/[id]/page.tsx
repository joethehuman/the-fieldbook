import { notFound } from "next/navigation";
import {
  readerCourseItem,
  readerCourseProgress,
  readerCourses,
  readerMetadata,
} from "@production/lib/reader";
import { ReaderCoursePlayer } from "@/components/reader/ReaderCoursePlayer";
import type { Curriculum } from "@/lib/types";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lesson?: string; curriculum?: string; from?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const { item, context } = await readerCourseItem(id);
  return readerMetadata(item, context);
}

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const { lesson, curriculum, from } = await searchParams;
  const { item, context } = await readerCourseItem(id);
  const progress = context.user ? await readerCourseProgress(id) : [];
  if (lesson && !item.lessons.some((entry) => entry.id === lesson)) notFound();
  const origin = curriculum ? (await readerCourses()).curricula.find((entry: Curriculum) =>
    entry.id === curriculum && entry.status === "published" && entry.courseIds.includes(item.id),
  ) : undefined;
  return (
      <ReaderCoursePlayer
        course={item}
        lessonId={lesson}
        curriculum={origin?.id}
        curriculumTitle={origin?.name}
        from={from}
        signedIn={!!context.user}
        initialProgress={progress.filter(
          (entry) => entry.version === item.version,
        )}
      />
    );
}
