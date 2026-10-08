import { CanonicalRecordUrl } from "@/components/reader/CanonicalRecordUrl";
import { recordId } from "@/lib/record-url";
import { contentPath } from "@/lib/navigation";
import { normalizeReaderUrl } from "@server/reader-url";
import { WorkspacePage } from "@/components/reader/WorkspacePage";
import { Article, ReadingBack } from "@/components/patterns/reading";
import { ReaderFeedback } from "@/components/reader/ReaderFeedback";
import {
  readerUpdateItem,
  readerMetadata,
  readerDetailShellContext,
} from "@server/reader";
import { siteOrigins } from "@server/installation";
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props) {
  const { id: segment } = await params;
  const id = recordId(segment) || "";
  const { item, context } = await readerUpdateItem(id);
  return readerMetadata(item, context);
}
export default async function Page({ params }: Props) {
  const { id: segment } = await params;
  const id = recordId(segment) || "";
  const { item, context } = await readerUpdateItem(id);
  await normalizeReaderUrl(contentPath(item.kind, item.id, item.title));
  return (
    <>
      <CanonicalRecordUrl id={item.id} path={contentPath(item.kind, item.id, item.title)} />
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
    </>
  );
}
