import { CanonicalRecordUrl } from "@/components/reader/CanonicalRecordUrl";
import { recordId } from "@/lib/record-url";
import { contentPath } from "@/lib/navigation";
import { normalizeReaderUrl } from "@server/reader-url";
import { WorkspacePage } from "@/components/reader/WorkspacePage";
import { notFound } from "next/navigation";
import {
  readerCourseItem,
  readerCourseProgress,
  readerCourses,
  readerMetadata,
  readerDetailShellContext,
} from "@server/reader";
import { ReaderCoursePlayer } from "@/components/reader/ReaderCoursePlayer";
import type { Curriculum } from "@/lib/types";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    lesson?: string;
    curriculum?: string;
    from?: string;
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { id: segment } = await params;
  const id = recordId(segment) || "";
  const { item, context } = await readerCourseItem(id);
  return readerMetadata(item, context);
}

export default async function Page({ params, searchParams }: Props) {
  const { id: segment } = await params;
  const id = recordId(segment) || "";
  const { lesson, curriculum, from } = await searchParams;
  const { item, context } = await readerCourseItem(id);
  await normalizeReaderUrl(contentPath(item.kind, item.id, item.title));
  const progress = context.user ? await readerCourseProgress(id) : [];
  if (lesson && !item.lessons.some((entry) => entry.id === lesson)) notFound();
  const origin = curriculum
    ? (await readerCourses()).curricula.find(
        (entry: Curriculum) =>
          entry.id === curriculum &&
          entry.status === "published" &&
          entry.courseIds.includes(item.id),
      )
    : undefined;
  return (
    <>
      <CanonicalRecordUrl id={item.id} path={contentPath(item.kind, item.id, item.title)} />
      <WorkspacePage
        section="/courses"
        context={readerDetailShellContext(context)}
      >
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
      </WorkspacePage>
    </>
  );
}
