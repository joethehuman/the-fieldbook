import { WorkspacePage } from "@/components/reader/WorkspacePage";
import { readerContext, readerCourses } from "@server/reader";
import { ReaderCourses } from "@/components/reader/ReaderCourses";

export async function generateMetadata() {
  const { branding } = await readerContext("/courses");
  return {
    title: `Courses | ${branding.name}`,
    description: `Published courses from ${branding.name}.`,
    ...(branding.access === "private"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

export async function CourseLibraryPage({ view = "home" }: { view?: import("@/lib/course-destination").LearningView }) {
  return (
    <WorkspacePage section="/courses">
      <ReaderCourses data={await readerCourses()} initialView={view} />
    </WorkspacePage>
  );
}
