import { PageHeader } from "@/components/patterns/layout";
import { TeamProgress } from "@/components/Teams";
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
    <>
      <PageHeader>
        <h1>Team progress</h1>
      </PageHeader>
      <TeamProgress
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
  );
}
