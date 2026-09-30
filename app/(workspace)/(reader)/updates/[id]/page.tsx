import { WorkspacePage } from "@/components/reader/WorkspacePage";
import { Article, ReadingBack } from "@/components/patterns/reading";
import { ReaderFeedback } from "@/components/reader/ReaderFeedback";
import {
  readerUpdateItem,
  readerMetadata,
  readerDetailShellContext,
} from "@server/reader";
import { siteOrigins } from "@server/env";
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
    <WorkspacePage
      section="/updates"
      context={readerDetailShellContext(context, "updates", item)}
    >
      <Article
        item={item}
        sameSiteOrigins={siteOrigins()}
        back={<ReadingBack kind="brief" clientNavigation />}
      >
        <ReaderFeedback key={item.id} contentId={item.id} />
      </Article>
    </WorkspacePage>
  );
}
