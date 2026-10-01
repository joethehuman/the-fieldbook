import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/patterns/layout";
import { TeamProgress } from "@/components/Teams";
import { readerTeam } from "@server/reader";

export const instant = true;
export const metadata = { title: "Team progress | Fieldbook", robots: { index: false, follow: false } };

export default function Page() {
  return <><PageHeader><h1>Team progress</h1></PageHeader><TeamProgress snapshotPromise={progress()} /></>;
}
async function progress() {
  "use cache: private";
  cacheLife({ stale: 30 });
  const snapshot = await readerTeam();
  if (!snapshot.user?.active || !["admin", "manager"].includes(snapshot.user.role)) notFound();
  return snapshot;
}
