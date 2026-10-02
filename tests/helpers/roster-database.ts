import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export const rosterMigrations = [
  "202609190001_fieldbook.sql",
  "202609190002_mcp_audience.sql",
  "202609200001_governance.sql",
  "202609200002_assignments.sql",
  "202609200003_required_learning.sql",
  "202609200004_learning_groups.sql",
  "20260923180607_guarded_team_deletion.sql",
  "20260923230000_scope_pending_group_cleanup.sql",
  "20260924150351_anonymous_feedback.sql",
  "20260926182840_general_feedback.sql",
  "20260927150657_bulk_actions_recovery.sql",
  "20260927151533_bulk_recovery_references.sql",
  "20260927152156_account_deletion_lock.sql",
  "20260927153217_media_cleanup_lock.sql",
  "20261001202740_admin_people_reads.sql",
  "20261001222227_roster_people.sql",
];
export const episodeMigration = "20261001232329_stable_assignment_episodes.sql";
export const contributorMigration =
  "20261001234401_contributor_permissions.sql";
export const flatGroupMigration = "20261002022921_flat_learning_groups.sql";
export async function migrate(pg: PGlite, name: string) {
  await pg.exec(
    await readFile(
      new URL(`../../supabase/migrations/${name}`, import.meta.url),
      "utf8",
    ),
  );
}
export async function rosterDatabase() {
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create role supabase_auth_admin; create schema auth; create table auth.users(id uuid primary key);
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create schema extensions; create function extensions.gen_random_bytes(integer) returns bytea language sql as 'select decode(repeat(''ab'',$1),''hex'')';`);
  for (const name of rosterMigrations) await migrate(pg, name);
  return pg;
}
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
    })),
  };
  patch(payload);
  return pg.query("select public.fb_save_governance($1,$2,'save',$3)", [
    actor,
    snapshot.revision,
    JSON.stringify(payload),
  ]);
}
