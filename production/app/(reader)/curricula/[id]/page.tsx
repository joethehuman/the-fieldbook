import { ReaderCurriculum } from "@/components/reader/ReaderCurriculum";
import { readerCurriculum } from "@production/lib/reader";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const { data, curriculum } = await readerCurriculum(id);
  return {
    title: `${curriculum.name} | ${data.settings.name}`,
    description: curriculum.description,
  };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  const { data, curriculum } = await readerCurriculum(id);
  return <ReaderCurriculum curriculum={curriculum} data={data} />;
}
