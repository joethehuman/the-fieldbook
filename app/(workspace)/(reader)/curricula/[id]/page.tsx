import { WorkspacePage } from "@/components/reader/WorkspacePage";
import { ReaderCurriculum } from "@/components/reader/ReaderCurriculum";
import {
  readerCurriculum,
  readerWorkspaceContext,
  readerDetailShellContext,
} from "@server/reader";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const { data, curriculum } = await readerCurriculum(id);
  return {
    title: `${curriculum.name} | ${data.settings.name}`,
    description: curriculum.description,
  };
}

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const { from } = await searchParams;
  const { data, curriculum } = await readerCurriculum(id);
  return (
    <WorkspacePage
      section="/curricula"
      context={readerDetailShellContext(
        await readerWorkspaceContext("/courses"),
        "curricula",
        { id: curriculum.id, title: curriculum.name },
      )}
    >
      <ReaderCurriculum curriculum={curriculum} data={data} from={from} />
    </WorkspacePage>
  );
}
