import { notFound, redirect } from "next/navigation";
import { readerCourseItem, readerMetadata } from "@production/lib/reader";
import { CourseOverview, ReadingBack } from "@/components/patterns/reading";

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
  const { item } = await readerCourseItem(id);
  const { lesson, curriculum } = await searchParams;
  if (lesson) {
    if (!item.lessons.some((entry) => entry.id === lesson)) notFound();
    const query = new URLSearchParams({ lesson });
    if (curriculum) query.set("curriculum", curriculum);
    redirect(`/learn/${encodeURIComponent(id)}?${query}`);
  }
  return (
    <CourseOverview
      item={item}
      curriculum={curriculum}
      lessonBase="/learn"
      back={
        <ReadingBack kind="course" curriculum={curriculum} clientNavigation />
      }
    />
  );
}
