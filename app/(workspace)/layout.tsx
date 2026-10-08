import { decodedRecordId, decodeRecordSegment } from "@/lib/record-url";
import { courseLibraryView } from "@/lib/course-destination";
import { teamPersonId } from "@/lib/team-destination";
import { ReaderShell } from "@/components/reader/ReaderShell";
import {
  readerShellContext,
  readerCourseItem,
  readerCurriculum,
  readerItem,
  readerUpdateItem,
  readerTeam,
} from "@server/reader";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

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
    (!["admin", "team"].includes(section) && parts.length > 2) ||
    !["docs", "updates", "courses", "curricula", "team", "admin"].includes(
      section,
    )
  )
    notFound();

  // Direct HTML must resolve before streaming. RSC navigation resolves in the
  // page, avoiding a second article read in the shared layout.
  if (section === "team" && requestHeaders.get("rsc") !== "1") {
    const personId = teamPersonId(path);
    if (parts.length > 1 && !personId) notFound();
    if (personId) {
      const { data } = await readerTeam();
      if (!data.progressReport?.people.some((person) => person.u.id === personId))
        notFound();
    }
  }
  if (section !== "admin" && section !== "team" && !courseLibraryView(path) && parts[1] && requestHeaders.get("rsc") !== "1") {
    const id = (section === "curricula" ? decodeRecordSegment(parts[1]) : decodedRecordId(parts[1])) || "";
    if (section === "docs") await readerItem("doc", id);
    else if (section === "updates") await readerUpdateItem(id);
    else if (section === "courses") await readerCourseItem(id);
    else if (section === "curricula") await readerCurriculum(id);
    else notFound();
  }
  return (
    <ReaderShell context={await readerShellContext(`/${section}`)}>
      {children}
    </ReaderShell>
  );
}
