import { DocsEmpty } from "@/components/patterns/docs-empty";
import { orderedDocs } from "@/lib/docs-navigation";
import { readerContext } from "@production/lib/reader";
import { redirect } from "next/navigation";
export async function generateMetadata() {
  const { branding } = await readerContext("/docs");
  return {
    title: `Docs | ${branding.name}`,
    description: `Published reference documents from ${branding.name}.`,
    ...(branding.access === "private"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
export default async function Page() {
  const { docs, docCategoryOrder, docSections } = await readerContext("/docs");
  const first = orderedDocs(docs, docCategoryOrder, docSections)[0];
  if (first) redirect(`/docs/${encodeURIComponent(first.id)}`);
  return <DocsEmpty />;
}
