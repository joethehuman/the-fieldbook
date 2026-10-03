import {
  rosterDatabase,
  migrate,
  episodeMigration,
  contributorMigration,
  flatGroupMigration,
  value,
} from "./roster-database";
export const progressMigration = "20261002232135_progress_report.sql";
export const personId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export async function progressDatabase() {
  const pg = await rosterDatabase();
  for (const n of [
    episodeMigration,
    contributorMigration,
    flatGroupMigration,
    "20261002064454_team_group_course_assignments.sql",
    "20261002135103_builtin_organization_team.sql",
    "20261002184642_organization_membership.sql",
    "20261002210106_combined_assignment_organization.sql",
    "20261002214011_combined_governance_safeguards.sql",
    "20261002222355_mcp_scoped_reports.sql",
  ])
    await migrate(pg, n);
  return pg;
}
export async function progressSeed(
  pg: Awaited<ReturnType<typeof progressDatabase>>,
) {
  await pg.exec(`insert into auth.users values('${personId(1)}'),('${personId(2)}'),('${personId(3)}'),('${personId(4)}'),('${personId(5)}');
 insert into fb_profiles(id,auth_user_id,name,email,role,team_id) values
 ('${personId(1)}','${personId(1)}','Admin','admin@example.test','admin',null),
 ('${personId(2)}','${personId(2)}','Manager outside scope','manager@example.test','manager','other'),
 ('${personId(3)}','${personId(3)}','Child learner','child@example.test','learner','child'),
 ('${personId(4)}','${personId(4)}','Secret sibling','sibling@example.test','learner','other'),
 ('${personId(5)}','${personId(5)}','Organization manager','root@example.test','manager',null),
 ('${personId(6)}',null,'Pending learner','pending@example.test','learner','child');
 update fb_config set teams=(select jsonb_agg(t||jsonb_build_object('managerId','${personId(5)}')) from jsonb_array_elements(teams)t)||jsonb_build_array(
 jsonb_build_object('id','sales','name','Sales','parentId',settings->>'organizationTeamId','managerId','${personId(2)}','learningItems',jsonb_build_array(jsonb_build_object('kind','course','id','${personId(10)}'),jsonb_build_object('kind','course','id','${personId(11)}'))),
 jsonb_build_object('id','child','name','Child','parentId','sales'),jsonb_build_object('id','other','name','Secret team','parentId',settings->>'organizationTeamId'));
 update fb_config set groups='[{"id":"shared","name":"Shared group","teamIds":["sales","other"],"learningItems":[{"kind":"course","id":"${personId(10)}"}]},{"id":"secret","name":"Secret group","teamIds":["other"]}]';
 insert into fb_documents(id,draft,published,published_revision) values
 ('${personId(10)}','{"kind":"course","title":"First","version":1,"lessons":[{"id":"a"},{"id":"b"}]}','{"kind":"course","title":"First","version":1,"lessons":[{"id":"a"},{"id":"b"}]}',1),
 ('${personId(11)}','{"kind":"course","title":"Second","version":2,"lessons":[{"id":"c"}]}','{"kind":"course","title":"Second","version":2,"lessons":[{"id":"c"}]}',1),
 ('${personId(12)}','{"kind":"course","title":"Optional","version":1,"lessons":[]}','{"kind":"course","title":"Optional","version":1,"lessons":[]}',1);
 select fb_sync_learning();update fb_assignment_episodes set due_date='2000-01-01' where ended_at is null;
 insert into fb_progress(user_id,content_id,version,lessons,passed,attempts) values
 ('${personId(3)}','${personId(10)}',1,'["a","b"]',true,'[{"answers":["SECRET ATTEMPT"]}]'),
 ('${personId(3)}','${personId(11)}',1,'["c"]',true,'[]'),
 ('${personId(3)}','${personId(12)}',1,'[]',true,'[]');`);
  return value(
    pg,
    "select settings->>'organizationTeamId' value from fb_config",
  );
}
