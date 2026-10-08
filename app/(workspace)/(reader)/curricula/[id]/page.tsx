import { CanonicalRecordUrl } from "@/components/reader/CanonicalRecordUrl";
import { curriculumPath } from "@/lib/navigation";
import { normalizeReaderUrl } from "@server/reader-url";
import { WorkspacePage } from "@/components/reader/WorkspacePage";
import { ReaderCurriculum } from "@/components/reader/ReaderCurriculum";
import {
  readerCurriculum,
  readerWorkspaceContext,
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
    alternates: { canonical: curriculumPath(curriculum.id, curriculum.name) },
  };
}

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const { from } = await searchParams;
  const { data, curriculum } = await readerCurriculum(id);
  await normalizeReaderUrl(curriculumPath(curriculum.id, curriculum.name));
  return (
    <>
      <CanonicalRecordUrl
        id={curriculum.id}
        path={curriculumPath(curriculum.id, curriculum.name)}
      />
      <WorkspacePage
        section="/curricula"
        context={await readerWorkspaceContext("/courses")}
      >
        <ReaderCurriculum curriculum={curriculum} data={data} from={from} />
      </WorkspacePage>
    </>
  );
}
