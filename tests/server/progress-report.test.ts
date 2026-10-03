import test from "node:test";
import assert from "node:assert/strict";
import {
  progressDatabase,
  progressMigration,
  progressSeed,
  personId as id,
} from "../helpers/progress-report-database";
import { migrate, value } from "../helpers/roster-database";
import {
  progressPeople,
  filterProgress,
  emptyProgressFilters,
  progressSummary,
  progressPeopleCsv,
  subteamProgress,
} from "../../lib/progress-report";
import type { ProgressReportRecord } from "../../server/progress-report";
import type { Workspace } from "../../lib/store";
import type { User } from "../../lib/types";
const viewer = (n: number, role: User["role"]): User => ({
  id: id(n),
  name: "Actor",
  email: "actor@example.test",
  role,
  active: true,
  registered: true,
  groups: [],
});
const workspace = (r: ProgressReportRecord): Workspace => ({
  schema: 1,
  users: [],
  content: [],
  groups: r.groups,
  teams: r.teams,
  progress: {},
  settings: r.settings,
  progressReport: { asOf: r.asOf, people: r.people },
});
const fingerprint = `select jsonb_build_object('config',(select to_jsonb(c) from fb_config c),'people',(select jsonb_agg(to_jsonb(p) order by id) from fb_profiles p),'progress',(select jsonb_agg(to_jsonb(p) order by user_id,content_id,version) from fb_progress p),'episodes',(select jsonb_agg(to_jsonb(e) order by id) from fb_assignment_episodes e)) value`;
test("compact report preserves data, scopes roster before aggregation, and denies detail escalation", async (t) => {
  const pg = await progressDatabase();
  try {
    const root = await progressSeed(pg);
    const before = await value(pg, fingerprint);
    await migrate(pg, progressMigration);
    assert.deepEqual(await value(pg, fingerprint), before);
    const read = async (n: number, person?: number) =>
      (await value(pg, "select fb_progress_report($1,$2) value", [
        id(n),
        person ? id(person) : null,
      ])) as ProgressReportRecord;
    await t.test(
      "manager includes pending descendants, excludes own sibling row and private metadata",
      async () => {
        const r = await read(2);
        assert.deepEqual(
          r.people.map((p) => p.u.id),
          [id(3), id(6)],
        );
        assert.deepEqual(r.teams.map((t) => t.id).sort(), ["child", "sales"]);
        assert.equal(JSON.stringify(r).includes("Secret"), false);
        assert.equal(JSON.stringify(r).includes("SECRET ATTEMPT"), false);
        assert.equal(JSON.stringify(r).includes("learningAssignments"), false);
        const scoped = workspace(r),
          scopedRows = progressPeople(scoped, viewer(2, "manager"));
        assert.deepEqual(
          filterProgress(scopedRows, scoped.teams, {
            ...emptyProgressFilters,
            personId: id(6),
          }).map((row) => row.u.id),
          [id(6)],
        );
        assert.equal(
          filterProgress(scopedRows, scoped.teams, {
            ...emptyProgressFilters,
            personId: id(1),
          }).length,
          0,
        );
        assert.equal(r.people[0].assigned, 2);
        assert.equal(r.people[0].completed, 1);
        assert.equal(r.people[0].overdue, 1);
        assert.equal(r.people[1].u.registered, false);
        assert.equal(r.people[1].assigned, 2);
        assert.equal(r.detail, null);
        await assert.rejects(() => read(2, 4), /outside/);
        await assert.rejects(() => read(3), /Reporting access/);
        await assert.rejects(() => read(6), /Reporting access/);
      },
    );
    await t.test(
      "Organization manager and admin include unassigned people; read, filter, charts and CSV agree",
      async () => {
        const r = await read(5);
        assert.equal(r.people.length, 6);
        assert.ok(
          r.people.some((p) => p.u.id === id(1) && p.u.teamId === root),
        );
        const admin = await read(1);
        assert.equal(admin.people.length, 6);
        const data = workspace(r),
          rows = progressPeople(data, viewer(5, "manager"));
        assert.equal(rows.length, 6);
        const sum = progressSummary(rows);
        assert.equal(sum.assignedPeople, 4);
        assert.equal(sum.current, 0);
        assert.equal(sum.unassigned, 2);
        const branches = subteamProgress(rows, data.teams!, root);
        assert.equal(
          branches.reduce((n, b) => n + b.people, 0),
          6,
        );
        const filtered = filterProgress(rows, data.teams, {
          ...emptyProgressFilters,
          group: "shared",
          query: rows.find((p) => p.u.id === id(6))!.u.email,
        });
        assert.deepEqual(
          filtered.map((p) => p.u.id),
          [id(6)],
        );
        assert.equal(progressPeopleCsv(filtered, true).rows.length, 1);
      },
    );
    await t.test(
      "saved dates, latest course version, overlaps and optional learning stay distinct",
      async () => {
        const r = await read(2, 3);
        assert.equal(r.detail!.courses.length, 2);
        assert.equal(r.detail!.courses[0].complete, true);
        assert.equal(r.detail!.courses[1].complete, false);
        assert.equal(r.detail!.courses[1].dueDate, "2000-01-01");
        assert.equal(r.detail!.courses[0].sources.length, 2);
        await pg.exec(
          `update fb_config set settings=settings||'{"dueDatesEnabled":false}'`,
        );
        const paused = await read(2);
        assert.ok(paused.people.every((p) => p.overdue === 0));
        assert.equal(
          progressPeople(workspace(paused), viewer(2, "manager"))[0].status,
          "incomplete",
        );
        assert.equal((await read(2, 3)).detail!.courses[1].dueDate, null);
        assert.ok(
          await value(
            pg,
            "select bool_and(due_date='2000-01-01') value from fb_assignment_episodes where ended_at is null",
          ),
        );
      },
    );
    await t.test(
      "service-only function and immediate role revocation",
      async () => {
        const grants = await value(
          pg,
          "select jsonb_build_object('anon',has_function_privilege('anon','fb_progress_report(uuid,uuid)','execute'),'authenticated',has_function_privilege('authenticated','fb_progress_report(uuid,uuid)','execute'),'service',has_function_privilege('service_role','fb_progress_report(uuid,uuid)','execute')) value",
        );
        assert.deepEqual(grants, {
          anon: false,
          authenticated: false,
          service: true,
        });
        await pg.exec(
          `update fb_profiles set active=false where id='${id(2)}'`,
        );
        await assert.rejects(() => read(2), /Reporting access/);
      },
    );
  } finally {
    await pg.close();
  }
});
test("500 people and 100 courses return person totals without course history", async (t) => {
  const pg = await progressDatabase();
  try {
    await migrate(pg, progressMigration);
    await pg.exec(`select set_config('fieldbook.learning_batch','on',false);insert into auth.users values('${id(1)}');insert into fb_profiles(id,auth_user_id,name,email,role) values('${id(1)}','${id(1)}','Admin','admin@example.test','admin');
 insert into fb_profiles(id,name,email,role,team_id) select ('00000000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid,'Learner '||n,'learner'||n||'@example.test','learner','branch-'||(n%20) from generate_series(1,500)n;
 insert into fb_documents(id,draft,published,published_revision) select ('00000000-0000-4000-8000-'||lpad((10000+n)::text,12,'0'))::uuid,jsonb_build_object('kind','course','title','Course '||n,'version',1,'lessons',jsonb_build_array(jsonb_build_object('id','lesson'))),jsonb_build_object('kind','course','title','Course '||n,'version',1,'lessons',jsonb_build_array(jsonb_build_object('id','lesson'))),1 from generate_series(1,100)n;
 update fb_config set teams=teams||(select jsonb_agg(jsonb_build_object('id','branch-'||n,'name','Branch '||n,'parentId',settings->>'organizationTeamId')) from generate_series(0,19)n),groups='[{"id":"all","name":"All learners","teamIds":[]}]';
 update fb_config set teams=(select jsonb_agg(case when t->>'system'='organization' then t||jsonb_build_object('learningItems',(select jsonb_agg(jsonb_build_object('kind','course','id',id)) from fb_documents)) else t end) from jsonb_array_elements(teams)t);
 select fb_sync_learning();`);
    const start = performance.now();
    const r = (await value(pg, "select fb_progress_report($1) value", [
      id(1),
    ])) as ProgressReportRecord;
    const ms = performance.now() - start;
    assert.equal(r.people.length, 501);
    assert.equal(
      r.people.reduce((n, p) => n + p.assigned, 0),
      50100,
    );
    assert.ok(JSON.stringify(r).length < 230000);
    assert.equal(r.detail, null);
    t.diagnostic(
      `500 learners / 100 courses / 20 branches: ${Math.round(ms)}ms; ${JSON.stringify(r).length} characters for ${r.people.length} person rows; 50,100 obligations counted.`,
    );
  } finally {
    await pg.close();
  }
});
