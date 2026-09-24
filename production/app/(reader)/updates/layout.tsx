import { ReaderShell } from "@/components/reader/ReaderShell";
import { readerContext, readerItem } from "@production/lib/reader";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = (await headers()).get("x-fieldbook-reader-path") || "/updates";
  const parts = path.split("/").filter(Boolean);
  if (parts.length > 2 || parts[0] !== "updates") notFound();
  if (parts[1]) await readerItem("brief", decodeURIComponent(parts[1]));
  const { user, branding, forYou, otherUpdates } =
    await readerContext("/updates");
  const updateTitles = [...forYou, ...otherUpdates].map(({ id, title }) => ({
    id,
    title,
  }));
  return (
    <ReaderShell
      context={{
        user,
        branding,
        docs: [],
        docCategoryOrder: [],
        docSections: [],
        updateTitles,
      }}
      section="updates"
    >
      {children}
    </ReaderShell>
  );
}
