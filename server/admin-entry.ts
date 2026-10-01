import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { actor, requireAdmin } from "./auth";
import { readConfig } from "./content";
import { brandingFromSettings } from "@/lib/branding";

// Layout/page admission is shared within this request only. APIs and mutations
// retain independent authorization; this is never a durable access cache.
export const adminUser = cache(async () => {
  const user = await actor(undefined, true);
  if (!user) redirect("/auth/sign-in?next=%2Fadmin");
  if (user.role !== "admin" || !user.active) notFound();
  requireAdmin(user);
  return user;
});

export const adminEntry = cache(async () => {
  const user = await adminUser();
  const config = await readConfig();
  return {
    user,
    shell: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        managesTeam: (config.teams || []).some(
          (team: { managerId?: string }) => team.managerId === user.id,
        ),
      },
      branding: brandingFromSettings(config.settings),
      docs: [],
      docCategoryOrder: [],
      docSections: [],
    },
  };
});
