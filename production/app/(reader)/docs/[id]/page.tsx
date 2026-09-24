import { Article, ReadingBack } from "@/components/patterns/reading";
import { ReaderFeedback } from "@/components/reader/ReaderFeedback";
import { readerItem, readerMetadata } from "@production/lib/reader";
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const { item, context } = await readerItem("doc", id);
  return readerMetadata(item, context);
}
export default async function Page({ params }: Props) {
  const { id } = await params;
  const { item, context } = await readerItem("doc", id);
  return (
    <Article
      item={item}
      name={context.branding.name}
      documents={context.docs}
      sectionOrder={context.docCategoryOrder}
      sections={context.docSections}
      back={<ReadingBack kind="doc" clientNavigation />}
    >
      {context.user && <ReaderFeedback key={item.id} contentId={item.id} />}
    </Article>
  );
}
