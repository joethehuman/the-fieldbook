import { connection } from "next/server";
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
  await connection();
  const { data, curriculum } = await readerCurriculum(id);
  return {
    title: `${curriculum.name} | ${data.settings.name}`,
    description: curriculum.description,
  };
}

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  await connection();
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

// Preserve blocking rendering for this route during scoped PPR adoption.
export const instant = false;

// Retain fresh request-time reader content during scoped Cache Components adoption.
export const prefetch = "force-disabled";
