import { ReaderShell } from "@/components/reader/ReaderShell";
import {
  readerContext,
  readerCourseItem,
  readerCurriculum,
  readerItem,
  readerTeamContext,
  readerUpdateItem,
} from "@server/reader";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const path = requestHeaders.get("x-fieldbook-reader-path") || "";
  const parts = path.split("/").filter(Boolean);
  const section = parts[0];
  if (
    parts.length < 1 ||
    parts.length > 2 ||
    !["docs", "updates", "courses", "curricula", "team"].includes(section)
  )
    notFound();

  // Direct HTML must resolve before streaming. RSC navigation resolves in the
  // page, avoiding a second article read in the shared layout.
  if (parts[1] && requestHeaders.get("rsc") !== "1") {
    const id = decodeURIComponent(parts[1]);
    if (section === "docs") await readerItem("doc", id);
    else if (section === "updates") await readerUpdateItem(id);
    else if (section === "courses") await readerCourseItem(id);
    else if (section === "curricula") await readerCurriculum(id);
    else notFound();
  }
  if (section === "team")
    return (
      <ReaderShell context={await readerTeamContext()}>{children}</ReaderShell>
    );
  const {
    user,
    branding,
    docs,
    docCategoryOrder,
    docSections,
    forYou,
    otherUpdates,
    courseTitles,
    curriculumTitles,
  } = await readerContext(`/${section}`);
  return (
    <ReaderShell
      context={{
        user,
        branding,
        docs,
        docCategoryOrder,
        docSections,
        updateTitles: [...forYou, ...otherUpdates].map(({ id, title }) => ({
          id,
          title,
        })),
        courseTitles,
        curriculumTitles,
      }}
    >
      {children}
    </ReaderShell>
  );
}
