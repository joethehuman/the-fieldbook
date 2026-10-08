"use client";
import { teamHref, teamPersonId } from "@/lib/team-destination";
import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { TeamProgress } from "@/components/Teams";
import type { Workspace } from "@/lib/store";
import type { User } from "@/lib/types";
import type { LandingNavigation } from "@/lib/navigation-guard";
import { useWorkspaceShell } from "./WorkspaceContext";

export function TeamWorkspace({ data, user, initialPerson }: { data: Workspace; user: User; initialPerson?: string }) {
  const pathname = usePathname();
  const personId = pathname === "/team" ? undefined : teamPersonId(pathname, data.progressReport?.people.map((person) => person.u)) || initialPerson;
  const { registerLandingNavigation } = useWorkspaceShell();
  const registerLanding = useCallback(
    (navigation: LandingNavigation | null) =>
      registerLandingNavigation("team", navigation),
    [registerLandingNavigation],
  );
  return (
    <TeamProgress
      initialPerson={personId}
      onDestinationChange={async (id) => { window.history.pushState(null, "", teamHref(id, data.progressReport?.people.find((person) => person.u.id === id)?.u.name)); return true; }}
      data={data}
      user={user}
      registerLandingNavigation={registerLanding}
    />
  );
}
