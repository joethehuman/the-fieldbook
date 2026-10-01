import { WorkspacePage } from "@/components/reader/WorkspacePage";
import { PageHeader } from "@/components/patterns/layout";
import { TeamWorkspace } from "@/components/reader/TeamWorkspace";
import { readerTeam, readerTeamContext } from "@server/reader";

export async function generateMetadata() {
  const { branding } = await readerTeamContext();
  return {
    title: `Team progress | ${branding.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function Page() {
  const { data, user } = await readerTeam();
  return (
    <WorkspacePage section="/team">
      <>
        <PageHeader>
          <h1>Team progress</h1>
        </PageHeader>
        <TeamWorkspace
          data={data}
          user={
            user || {
              id: "guest",
              name: "Guest",
              email: "",
              role: "learner",
              groups: [],
              active: false,
            }
          }
        />
      </>
    </WorkspacePage>
  );
}
