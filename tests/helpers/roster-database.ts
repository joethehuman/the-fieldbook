import type { PGlite } from "@electric-sql/pglite";
import { database } from "./database.mjs";
export const rosterDatabase = database;
export async function value(pg: PGlite, sql: string, args: unknown[] = []) {
  return (await pg.query<any>(sql, args)).rows[0]?.value;
}
export async function saveRoster(
  pg: PGlite,
  actor: string,
  patch: (data: any) => void,
) {
  const snapshot = await value(
    pg,
    "select public.fb_admin_people_snapshot($1) as value",
    [actor],
  );
  const payload = {
    groups: snapshot.groups,
    teams: snapshot.teams,
    curricula: snapshot.curricula,
    users: snapshot.users.map((p: any) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      active: p.active,
      groups: p.groups,
      teamId: p.team_id,
      hireDate: p.hire_date,
      onboardingStart: p.onboarding_start,
      onboardingDays: p.onboarding_days,
    })),
  };
  patch(payload);
  return pg.query("select public.fb_save_governance($1,$2,'save',$3)", [
    actor,
    snapshot.revision,
    JSON.stringify(payload),
  ]);
}
