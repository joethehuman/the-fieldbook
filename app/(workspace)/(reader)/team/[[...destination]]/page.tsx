import { teamHref, teamPersonId } from "@/lib/team-destination";
import { notFound } from "next/navigation";
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

export default async function Page({
  params,
}: {
  params: Promise<{ destination?: string[] }>;
}) {
  const segments = (await params).destination || [];
  const path =
    "/team" +
    (segments.length ? "/" + segments.map(encodeURIComponent).join("/") : "");
  const personId = teamPersonId(path);
  if (segments.length && !personId) notFound();
  const { data, user } = await readerTeam();
  if (
    personId &&
    !data.progressReport?.people.some((person) => person.u.id === personId)
  )
    notFound();
  return (
    <WorkspacePage section="/team">
      <>
        <PageHeader>
          <h1>Team progress</h1>
        </PageHeader>
        <TeamWorkspace
          data={data}
          initialPerson={personId}
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
