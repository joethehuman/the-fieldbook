import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const chain = [
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

const stable = "20261001232329_stable_assignment_episodes.sql",
  contributor = "20261001234401_contributor_permissions.sql",
  mixed = "20261002064454_team_group_course_assignments.sql";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function migrate(pg: PGlite, name: string) {
  try {
    await pg.exec(
      await readFile(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  } catch (e: any) {
    throw new Error(`${name}: ${e.message}; ${e.where}; ${e.internalQuery}`);
  }
}

for (const history of [
  "fresh",
  "main-upgrade",
  "preview-flat",
  "preview-organization",
] as const)
  test(`team/group migration and coverage: ${history}`, async () => {
    const pg = new PGlite();
    const value = async (sql: string, args: any[] = []) =>
      (await pg.query<any>(sql, args)).rows[0]?.value;
    try {
      await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
   create schema auth; create table auth.users(id uuid primary key);
   create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create schema extensions; create function extensions.gen_random_bytes(integer) returns bytea language sql as 'select decode(repeat(''ab'',$1),''hex'')';`);
      for (const name of chain) await migrate(pg, name);
      await pg.exec(`insert into auth.users values('${id(20)}'),('${id(21)}');
   insert into fb_profiles(id,auth_user_id,email,name,role,team_id,groups,effective_group_joined_at) values
    ('${id(20)}','${id(20)}','baseline@example.test','Baseline learner','learner','legacy-child','[]','{"legacy":"2026-09-01T00:00:00.000Z"}'),
    ('${id(21)}','${id(21)}','baseline-admin@example.test','Baseline admin','admin',null,'[]','{}');
   update fb_config set groups='[{"id":"legacy","name":"Legacy cohort","teamIds":["legacy-child"],"learningItems":[{"kind":"course","id":"${id(22)}"}],"requiredCourseIds":["${id(22)}"]}]',teams='[{"id":"legacy-child","name":"Legacy team"}]';
   insert into fb_documents(id,draft,published,revision,published_revision) values('${id(22)}','{"id":"${id(22)}","kind":"course","title":"Baseline course","status":"published","version":1,"lessons":[{"id":"lesson"}]}','{"id":"${id(22)}","kind":"course","title":"Baseline course","status":"published","version":1,"lessons":[{"id":"lesson"}]}',1,1);
   insert into fb_progress(user_id,content_id,version,lessons,passed) values('${id(20)}','${id(22)}',1,'["lesson"]',true);`);
      if (history === "main-upgrade") {
        await migrate(pg, contributor);
        await migrate(pg, stable);
      } else {
        await migrate(pg, stable);
        await migrate(pg, contributor);
      }
      if (history === "preview-flat" || history === "preview-organization") {
        await pg.exec(
          await readFile(
            new URL("./fixtures/flat-learning-groups.sql", import.meta.url),
            "utf8",
          ),
        );
      }
      if (history === "preview-organization")
        for (const file of [
          "organization-team.sql",
          "organization-membership.sql",
        ])
          await pg.exec(
            await readFile(
              new URL(`./fixtures/${file}`, import.meta.url),
              "utf8",
            ),
          );
      const baseline = await value("select fb_person_assignments($1) value", [
        id(20),
      ]);
      const retained = await value(
        "select jsonb_build_object('documents',(select jsonb_agg(to_jsonb(d)) from fb_documents d),'progress',(select jsonb_agg(to_jsonb(p)) from fb_progress p)) value",
      );
      const priorGroups = await value(
        "select groups value from fb_config where id",
      );
      await migrate(pg, mixed);
      const upgraded = await value("select fb_person_assignments($1) value", [
        id(20),
      ]);
      assert.equal(upgraded[0].episodeId, baseline[0].episodeId);
      assert.equal(upgraded[0].assignedAt, baseline[0].assignedAt);
      assert.equal(upgraded[0].dueDate, baseline[0].dueDate);
      assert.deepEqual(upgraded[0].sourceAudiences, [
        { kind: "group", id: "legacy" },
      ]);
      assert.deepEqual(
        await value(
          "select jsonb_build_object('documents',(select jsonb_agg(to_jsonb(d)) from fb_documents d),'progress',(select jsonb_agg(to_jsonb(p)) from fb_progress p)) value",
        ),
        retained,
      );
      assert.deepEqual(
        await value("select groups value from fb_config where id"),
        priorGroups,
      );
      if (history === "preview-organization") {
        const cfg = await value(
          "select to_jsonb(c) value from fb_config c where id",
        );
        const root = cfg.teams.find((t: any) => t.system === "organization");
        await pg.exec(`update fb_profiles set role='contributor' where id='${id(21)}';
          update fb_config set teams=(select jsonb_agg(case when t->>'system'='organization' then t||jsonb_build_object('managerId','${id(21)}','learningItems',jsonb_build_array(jsonb_build_object('kind','course','id','${id(22)}'))) else t end) from jsonb_array_elements(teams) t); select fb_sync_learning();`);
        const assignments = await value(
          "select fb_person_assignments($1) value",
          [id(21)],
        );
        assert.deepEqual(assignments[0].sourceAudiences, [
          { kind: "team", id: root.id },
        ]);
        const scoped = await value("select fb_governance_snapshot($1) value", [
          id(21),
        ]);
        assert.equal(
          scoped.users.length,
          2,
          "root manager retains effective membership scope",
        );
        assert.equal(
          scoped.users.find((p: any) => p.id === id(21)).assignment_teams[0].id,
          root.id,
        );
        await assert.rejects(
          pg.exec("update fb_config set teams='[]'"),
          /Organization/,
        );
        return;
      }
      await pg.exec(`insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}');
   insert into fb_profiles(id,auth_user_id,email,name,role,team_id) values
    ('${id(1)}','${id(1)}','admin@example.test','Admin','admin',null),
    ('${id(2)}','${id(2)}','learner@example.test','Learner','learner','child'),
    ('${id(3)}','${id(3)}','manager@example.test','Manager','contributor',null);
   update fb_config set groups='[{"id":"g","name":"Cohort","learningItems":[]}]',teams='[{"id":"root","name":"Sales","managerId":"${id(3)}","learningItems":[]},{"id":"child","name":"West","parentId":"root","learningItems":[]},{"id":"legacy-child","name":"Legacy team","learningItems":[]}]';
   insert into fb_documents(id,draft,published,revision,published_revision) values('${id(10)}','{"id":"${id(10)}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}','{"id":"${id(10)}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}',1,1);`);
      const act = (operation: string, audience: any) =>
        value("select fb_manage_learning($1,$2) value", [
          id(1),
          { operation, contentId: id(10), expected: 1, ...audience },
        ]);
      await act("assign", { teamId: "root" });
      const first = await value("select fb_person_assignments($1) value", [
        id(2),
      ]);
      assert.equal(first.length, 1);
      assert.deepEqual(first[0].sourceAudiences, [
        { kind: "team", id: "root" },
      ]);
      await pg.exec(
        `update fb_profiles set groups='["g"]' where id='${id(2)}'; update fb_config set groups='[{"id":"g","name":"Cohort","learningItems":[{"kind":"course","id":"${id(10)}"}]}]'; select fb_sync_learning();`,
      );
      const overlap = await value("select fb_person_assignments($1) value", [
        id(2),
      ]);
      assert.equal(overlap.length, 1);
      assert.equal(overlap[0].episodeId, first[0].episodeId);
      assert.equal(overlap[0].dueDate, first[0].dueDate);
      assert.equal(overlap[0].sourceAudiences.length, 2);
      await pg.exec(
        `update fb_config set teams=jsonb_set(teams,'{0,learningItems}','[]'); select fb_sync_learning();`,
      );
      assert.equal(
        (await value("select fb_person_assignments($1) value", [id(2)]))[0]
          .episodeId,
        first[0].episodeId,
      );
      const cfg = await value("select to_jsonb(c) value from fb_config c");
      const users = (
        await pg.query<any>(
          "select * from fb_profiles where deleted_at is null order by id",
        )
      ).rows.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        role: p.role,
        active: p.active,
        groups: p.groups,
        teamId: p.team_id,
      }));
      users.find((p) => p.id === id(2))!.groups = [];
      const teams = cfg.teams.map((t: any) =>
        t.id === "root"
          ? { ...t, learningItems: [{ kind: "course", id: id(10) }] }
          : t,
      );
      await value("select fb_save_governance($1,$2,'save',$3) value", [
        id(1),
        cfg.governance_revision,
        { groups: cfg.groups, teams, users, curricula: cfg.curricula },
      ]);
      const swapped = await value("select fb_person_assignments($1) value", [
        id(2),
      ]);
      assert.equal(
        swapped[0].episodeId,
        first[0].episodeId,
        "atomic source replacement keeps clock",
      );
      assert.deepEqual(swapped[0].sourceAudiences, [
        { kind: "team", id: "root" },
      ]);
      // Soft deletion retains plan references during recovery, without blocking unrelated governance.
      await pg.exec(
        `update fb_documents set deleted_at=now(),published=null where id='${id(10)}';`,
      );
      const retainedCfg = await value(
        "select to_jsonb(c) value from fb_config c",
      );
      await value("select fb_save_governance($1,$2,'save',$3) value", [
        id(1),
        retainedCfg.governance_revision,
        {
          groups: retainedCfg.groups,
          teams: retainedCfg.teams,
          users,
          curricula: retainedCfg.curricula,
        },
      ]);
      await pg.exec(
        `update fb_documents set deleted_at=null,published=draft where id='${id(10)}';`,
      );
      const scoped = await value("select fb_governance_snapshot($1) value", [
        id(3),
      ]);
      assert.equal(scoped.users.length, 2);
      assert.equal(
        scoped.users.find((p: any) => p.id === id(2)).assignment_teams.length,
        1,
      );
      await assert.rejects(
        value("select fb_manage_learning($1,$2) value", [
          id(3),
          {
            operation: "assign",
            teamId: "root",
            contentId: id(10),
            expected: 1,
          },
        ]),
        /Administrator/,
      );
      await pg.exec(
        `update fb_config set teams=jsonb_set(teams,'{0,learningItems}','[]'); select fb_sync_learning();`,
      );
      assert.deepEqual(
        await value("select fb_person_assignments($1) value", [id(2)]),
        [],
      );
      await pg.exec(
        `update fb_config set teams=jsonb_set(teams,'{0,learningItems}','[{"kind":"course","id":"${id(10)}"}]'); select fb_sync_learning();`,
      );
      assert.notEqual(
        (await value("select fb_person_assignments($1) value", [id(2)]))[0]
          .episodeId,
        first[0].episodeId,
      );
      assert.equal(
        await value(
          "select has_table_privilege('authenticated','fb_assignment_episodes','select') value",
        ),
        false,
      );
    } finally {
      await pg.close();
    }
  });
