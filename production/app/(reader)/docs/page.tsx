import { Article } from "@/components/patterns/reading";
import { ReaderFeedback } from "@/components/reader/ReaderFeedback";
import { DocsEmpty } from "@/components/patterns/docs-empty";
import { orderedDocs } from "@/lib/docs-navigation";
import {
  readerContext,
  readerItem,
  readerMetadata,
} from "@production/lib/reader";
import { siteOrigins } from "@production/lib/env";
export async function generateMetadata() {
  const context = await readerContext("/docs");
  const first = orderedDocs(
    context.docs,
    context.docCategoryOrder,
    context.docSections,
  )[0];
  if (first) {
    const { item } = await readerItem("doc", first.id);
    return readerMetadata(item, context);
  }
  const { branding } = context;
  return {
    title: `Docs | ${branding.name}`,
    description: `Published reference documents from ${branding.name}.`,
    ...(branding.access === "private"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
export default async function Page() {
  const context = await readerContext("/docs");
  const first = orderedDocs(
    context.docs,
    context.docCategoryOrder,
    context.docSections,
  )[0];
  if (!first) return <DocsEmpty />;
  const { item } = await readerItem("doc", first.id);
  return (
    <Article
      item={item}
      name={context.branding.name}
      documents={context.docs}
      sectionOrder={context.docCategoryOrder}
      sections={context.docSections}
      sameSiteOrigins={siteOrigins()}
    >
      <ReaderFeedback key={item.id} contentId={item.id} />
    </Article>
  );
}
