import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { canPublish, canAdminister, canOpenAdminTab } from "../lib/permissions";
import { reportTeamIds, type User } from "../lib/types";
import { availableDocSections, sectionForDoc } from "../lib/docs-navigation";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user: User = {
  id: id(2),
  name: "Publisher",
  email: "publisher@example.test",
  role: "contributor",
  active: true,
  groups: [],
};

test("publishing and managed-team permissions compose without granting administration", () => {
  const teams = [
    { id: "root", name: "Root", managerId: user.id },
    { id: "child", name: "Child", parentId: "root" },
    { id: "sibling", name: "Sibling" },
  ];
  assert.equal(canPublish(user), true);
  assert.equal(canAdminister(user), false);
  for (const tab of ["content", "feedback", "settings-mcp", "deleted"])
    assert.equal(canOpenAdminTab(user, tab), true);
  for (const tab of [
    "people",
    "teams",
    "progress",
    "groups",
    "curricula",
    "settings-docs",
    "settings-access",
  ])
    assert.equal(canOpenAdminTab(user, tab), false);
  assert.deepEqual([...reportTeamIds(user, teams)], ["root", "child"]);
  assert.equal(reportTeamIds(user, []).size, 0);
  for (const change of [
    { active: false },
    { registered: false },
    { role: "learner" as const },
    { role: "manager" as const },
  ])
    assert.equal(canPublish({ ...user, ...change }), false);
  assert.equal(reportTeamIds({ ...user, registered: false }, teams).size, 0);
});

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
async function migration(pg: PGlite, name: string) {
  const sql = await readFile(
    new URL(`../supabase/history/initial-development/${name}`, import.meta.url),
    "utf8",
  );
  try {
    await pg.exec(sql);
  } catch (error: any) {
    throw new Error(
      `${name}: ${error.message}; position=${error.position}; internal=${error.internalQuery}; context=${error.where}`,
    );
  }
}
test("contributor migration preserves records and enforces publishing, recovery, governance and team scope", async () => {
  const pg = new PGlite();
  const query = async (sql: string, args: any[] = []) =>
    (await pg.query<any>(sql, args)).rows[0]?.value;
  try {
    await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
      create schema auth; create table auth.users(id uuid primary key);
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create schema extensions; create function extensions.gen_random_bytes(integer) returns bytea language sql as 'select decode(repeat(''ab'',$1),''hex'')';`);
    for (const name of chain) await migration(pg, name);
    await pg.exec(`insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}');
      insert into fb_profiles(id,auth_user_id,email,name,role,team_id) values
      ('${id(1)}','${id(1)}','admin@example.test','Admin','admin',null),
      ('${id(2)}','${id(2)}','publisher@example.test','Publisher','manager',null),
      ('${id(3)}','${id(3)}','child@example.test','Child learner','learner','child'),
      ('${id(4)}','${id(4)}','sibling@example.test','Sibling learner','learner','sibling');
      update fb_config set teams='[{"id":"root","name":"Root","managerId":"${id(2)}"},{"id":"child","name":"Child","parentId":"root"},{"id":"sibling","name":"Sibling"}]', settings=settings||'{"docSections":[{"id":"guide","name":"Guides"}],"privacy":{"draft":{"body":"PRIVATE POLICY"}}}';
      insert into fb_documents(id,draft,published,revision,published_revision) values('${id(10)}','{"id":"${id(10)}","kind":"course","title":"Existing course","groups":[],"assignments":[],"status":"published","version":1}','{"id":"${id(10)}","kind":"course","title":"Existing course","groups":[],"assignments":[],"status":"published","version":1}',1,1);
      insert into fb_progress(user_id,content_id,version,lessons,passed) values('${id(3)}','${id(10)}',1,'["lesson"]',true),('${id(4)}','${id(10)}',1,'[]',false);
      insert into fb_feedback(id,user_id,content_id,version,rating,comment) values(gen_random_uuid(),'${id(3)}','${id(10)}',1,'up','Preserved feedback');`);
    const fingerprint = () =>
      query(
        "select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(p) order by id) from fb_profiles p),'config',(select to_jsonb(c) from fb_config c),'documents',(select jsonb_agg(to_jsonb(d) order by id) from fb_documents d),'progress',(select jsonb_agg(to_jsonb(p) order by user_id) from fb_progress p),'feedback',(select jsonb_agg(to_jsonb(f)) from fb_feedback f),'audit',(select jsonb_agg(to_jsonb(a)) from fb_audit a)) value",
      );
    const before = await fingerprint();
    await migration(pg, "20261001234401_contributor_permissions.sql");
    assert.deepEqual(await fingerprint(), before);
    const cfg = await query("select to_jsonb(c) value from fb_config c");
    const roster = (await pg.query<any>("select * from fb_profiles order by id")).rows;
    const payload = { groups: cfg.groups, teams: cfg.teams, curricula: cfg.curricula,
      users: roster.map((p) => ({ id: p.id, name: p.name, email: p.email,
        role: p.id === id(2) ? "contributor" : p.role, active: p.active, groups: p.groups, teamId: p.team_id || undefined })) };
    await query("select fb_save_governance($1,$2,'save',$3) value", [id(1), cfg.governance_revision, payload]);
    assert.deepEqual((await query("select to_jsonb(c) value from fb_config c")).teams, cfg.teams);
    await pg.exec("set role service_role");
    const save = (doc: any, expected = 0, publish = false) =>
      query(
        "select to_jsonb(fb_save_document($1,$2,$3,$4,false,$5,'web')) value",
        [doc.id, expected, doc, publish, id(2)],
      );
    const doc = {
      id: id(11),
      kind: "doc",
      title: "Contributor doc",
      category: "Guides",
      folder: "",
      sectionId: "guide",
      status: "draft",
      version: 1,
    };
    assert.equal((await save(doc)).revision, 1);
    assert.ok((await save({ ...doc, status: "published" }, 1, true)).published);
    await assert.rejects(save(doc, 1), /Revision conflict/);
    await assert.rejects(save({ ...doc, sectionOrder: 99 }, 2), /reorder Docs/);
    await assert.rejects(
      save({ ...doc, sectionId: "invented", category: "Invented" }, 2),
      /existing Docs section/,
    );
    await assert.rejects(
      save({ id: id(12), kind: "course", groups: ["sales"], assignments: [] }),
      /course assignments/,
    );
    await assert.rejects(
      save(
        {
          id: id(10),
          kind: "course",
          groups: [],
          assignments: [{ groupId: "sales", assignedAt: "2026-10-01" }],
        },
        1,
      ),
      /course assignments/,
    );
    await assert.rejects(
      query("select fb_save_governance($1,1,'save','{}') value", [id(2)]),
      /Administrator/,
    );
    await assert.rejects(
      query("select fb_admin_people_snapshot($1) value", [id(2)]),
      /Administrator/,
    );
    await assert.rejects(
      query("select fb_restore_deleted($1,'user',$2,1) value", [id(2), id(4)]),
      /Administrator/,
    );
    await assert.rejects(
      query("select fb_bulk_content($1,$2,2,'metadata',$3,1) value", [
        id(2),
        id(11),
        { category: "Bad", folder: "", sectionId: "bad" },
      ]),
      /existing Docs section/,
    );
    assert.equal(
      await query("select fb_bulk_content($1,$2,2,'delete') value", [
        id(2),
        id(11),
      ]),
      "changed",
    );
    await assert.rejects(
      query("select fb_restore_deleted($1,'content',$2,2) value", [
        id(2),
        id(11),
      ]),
      /Revision conflict/,
    );
    // Removing an empty section must not destroy a deleted Doc's recovery path.
    await pg.exec(`reset role; update fb_config set settings=jsonb_set(settings,'{docSections}','[]'); set role service_role;`);
    assert.equal(
      await query("select fb_restore_deleted($1,'content',$2,3) value", [
        id(2),
        id(11),
      ]),
      "changed",
    );
    const restored = await query(
      "select to_jsonb(d) value from fb_documents d where id=$1",
      [id(11)],
    );
    assert.equal(restored.published, null);
    assert.equal(restored.draft.status, "draft");
    assert.equal(restored.deleted_at, null);
    assert.equal(restored.draft.sectionId, "guide");
    const recoveredSections = availableDocSections([restored.draft], [], []);
    assert.equal(sectionForDoc(restored.draft, recoveredSections)?.name, "Guides");
    assert.equal(await query("select count(*)::int value from fb_deleted_items where entity='content' and id=$1", [id(11)]), 0);
    const scoped = await query("select fb_governance_snapshot($1) value", [
      id(2),
    ]);
    assert.deepEqual(scoped.teams.map((t: any) => t.id).sort(), [
      "child",
      "root",
    ]);
    assert.deepEqual(scoped.users.map((u: any) => u.id).sort(), [id(2), id(3)]);
    assert.equal(scoped.progress.length, 1);
    assert.equal(scoped.progress[0].user_id, id(3));
    await pg.exec(
      `reset role; update fb_config set teams='[]'; set role service_role;`,
    );
    const alone = await query("select fb_governance_snapshot($1) value", [
      id(2),
    ]);
    assert.deepEqual(alone.teams, []);
    assert.deepEqual(
      alone.users.map((u: any) => u.id),
      [id(2)],
    );
    assert.deepEqual(alone.progress, []);
    const currentRevision = await query("select governance_revision value from fb_config");
    await query("select fb_save_governance($1,$2,'pending',$3) value", [id(1), currentRevision,
      { name: "Preregistered Publisher", email: "pending@example.test", role: "contributor", groups: [], hireDate: "2025-03-01" }]);
    const pending = await query("select to_jsonb(p) value from fb_profiles p where email='pending@example.test'");
    assert.equal(pending.role, "contributor"); assert.equal(pending.auth_user_id, null);
    assert.deepEqual((await query("select fb_governance_snapshot($1) value", [pending.id])).users, []);
    await assert.rejects(query("select fb_require_publisher($1) value", [pending.id]), /publishing access/);
    await pg.exec(`reset role; insert into auth.users values('${id(5)}'); set role service_role;`);
    const activated = await query("select to_jsonb(fb_register_profile($1,'pending@example.test','Verified Publisher',false)) value", [id(5)]);
    assert.equal(activated.id, pending.id); assert.equal(activated.role, "contributor");
    assert.equal(activated.hire_date, "2025-03-01"); assert.equal(activated.auth_user_id, id(5));
    assert.equal(await query("select fb_require_publisher($1) value", [pending.id]), "contributor");
    for (const clause of [
      "active=false",
      "active=true,auth_user_id=null",
      "auth_user_id='" + id(2) + "',deleted_at=now()",
      "deleted_at=null,role='manager'",
    ]) {
      await pg.exec(
        `reset role; update fb_profiles set ${clause} where id='${id(2)}'; set role service_role;`,
      );
      await assert.rejects(
        save({ ...doc, title: "Forbidden" }, 4),
        /publishing access/,
      );
    }
    await pg.exec("reset role; set role authenticated");
    await assert.rejects(
      query("select fb_require_publisher($1) value", [id(1)]),
      /permission denied/,
    );
    await assert.rejects(
      query("select fb_save_document($1,0,'{}',false,false,$2,'web') value", [
        id(20),
        id(1),
      ]),
      /permission denied/,
    );
  } finally {
    await pg.close();
  }
});
