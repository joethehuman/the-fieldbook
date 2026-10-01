import { connection } from "next/server";
import { WorkspacePage } from "@/components/reader/WorkspacePage";
import { readerContext, readerCourses } from "@server/reader";
import { ReaderCourses } from "@/components/reader/ReaderCourses";

export async function generateMetadata() {
  await connection();
  const { branding } = await readerContext("/courses");
  return {
    title: `Courses | ${branding.name}`,
    description: `Published courses from ${branding.name}.`,
    ...(branding.access === "private"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

export default async function Page() {
  await connection();
  return (
    <WorkspacePage section="/courses">
      <ReaderCourses data={await readerCourses()} />
    </WorkspacePage>
  );
}

// Preserve blocking rendering for this route during scoped PPR adoption.
export const instant = false;

// Retain fresh request-time reader content during scoped Cache Components adoption.
export const prefetch = "force-disabled";
