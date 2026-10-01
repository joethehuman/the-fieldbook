"use client";
import { useCallback } from "react";
import { TeamProgress } from "@/components/Teams";
import type { Workspace } from "@/lib/store";
import type { User } from "@/lib/types";
import type { LandingNavigation } from "@/lib/navigation-guard";
import { useWorkspaceShell } from "./WorkspaceContext";

export function TeamWorkspace({ data, user }: { data: Workspace; user: User }) {
  const { registerLandingNavigation } = useWorkspaceShell();
  const registerLanding = useCallback(
    (navigation: LandingNavigation | null) =>
      registerLandingNavigation("team", navigation),
    [registerLandingNavigation],
  );
  return (
    <TeamProgress
      data={data}
      user={user}
      registerLandingNavigation={registerLanding}
    />
  );
}
