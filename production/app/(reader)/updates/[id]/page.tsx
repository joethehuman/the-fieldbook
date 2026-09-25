import { Article, ReadingBack } from "@/components/patterns/reading";
import { ReaderFeedback } from "@/components/reader/ReaderFeedback";
import { readerUpdateItem, readerMetadata } from "@production/lib/reader";
import { siteOrigins } from "@production/lib/env";
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const { item, context } = await readerUpdateItem(id);
  return readerMetadata(item, context);
}
export default async function Page({ params }: Props) {
  const { id } = await params;
  const { item, context } = await readerUpdateItem(id);
  return (
    <Article
      item={item}
      name={context.branding.name}
      sameSiteOrigins={siteOrigins()}
      back={<ReadingBack kind="brief" clientNavigation />}
    >
      <ReaderFeedback key={item.id} contentId={item.id} />
    </Article>
  );
}
