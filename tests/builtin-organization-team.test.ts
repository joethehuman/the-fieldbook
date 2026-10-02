import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  rosterDatabase,
  migrate,
  value,
  saveRoster,
  episodeMigration,
  contributorMigration,
  flatGroupMigration,
} from "./helpers/roster-database";
const migration = "20261002135103_builtin_organization_team.sql";
const admin = "00000000-0000-4000-8000-000000000001";
const manager = "00000000-0000-4000-8000-000000000002";
const learner = "00000000-0000-4000-8000-000000000003";
const direct = "00000000-0000-4000-8000-000000000004";
const course = "00000000-0000-4000-8000-000000000005";

async function fixture(selected = false) {
  const pg = await rosterDatabase();
  await migrate(pg, episodeMigration);
  await migrate(pg, contributorMigration);
  await migrate(pg, flatGroupMigration);
  await pg.exec(`insert into auth.users values('${admin}'),('${manager}'),('${learner}'),('${direct}');
    insert into public.fb_profiles(id,auth_user_id,name,email,role,team_id,hire_date,onboarding_days) values
    ('${admin}','${admin}','Admin','admin@example.test','admin',null,null,null),
    ('${manager}','${manager}','Manager','manager@example.test','contributor',null,null,null),
    ('${learner}','${learner}','Learner','learner@example.test','learner','leaf','2026-01-01',90),
    ('${direct}','${direct}','Direct','direct@example.test','learner','sales','2026-01-01',90);`);
  const teams = [
    { id: "sales", name: "Historical sales", managerId: manager },
    { id: "leaf", name: "Leaf", parentId: "sales" },
    ...(!selected ? [{ id: "other", name: "Other" }] : []),
  ];
  const groups = [
    {
      id: "subtree",
      name: "Subtree",
      teamIds: ["sales"],
      legacyDirectTeamIds: [],
      learningItems: [{ kind: "course", id: course }],
      requiredCourseIds: [course],
    },
    {
      id: "legacy",
      name: "Legacy",
      teamIds: [],
      legacyDirectTeamIds: ["sales"],
      learningItems: [{ kind: "course", id: course }],
      requiredCourseIds: [course],
    },
  ];
  await pg.query(
    "update public.fb_config set teams=$1,groups=$2,settings=settings||$3::jsonb",
    [
      JSON.stringify(teams),
      JSON.stringify(groups),
      JSON.stringify({
        onboardingDays: 90,
        catchUpDays: 7,
        organizationTeamId: selected ? "sales" : null,
      }),
    ],
  );
  const document = {
    id: course,
    title: "Course",
    kind: "course",
    status: "published",
    version: 1,
    groups: ["subtree", "legacy"],
    assignments: [],
    lessons: [],
    questions: [],
    updatedAt: "2026-01-01T00:00:00Z",
  };
  await pg.query(
    "insert into public.fb_documents(id,draft,published) values($1,$2,$2)",
    [course, JSON.stringify(document)],
  );
  await pg.query("select public.fb_sync_learning()");
  await pg.query(
    "insert into public.fb_progress(user_id,content_id,version,lessons,passed) values($1,$2,1,'[]',true)",
    [learner, course],
  );
  return pg;
}
async function fingerprint(pg: Awaited<ReturnType<typeof fixture>>) {
  return await value(
    pg,
    `select jsonb_build_object(
    'people',(select jsonb_agg(to_jsonb(p) order by p.id) from public.fb_profiles p),
    'episodes',(select jsonb_agg(to_jsonb(e) order by e.id) from public.fb_assignment_episodes e),
    'progress',(select jsonb_agg(to_jsonb(p) order by p.user_id,p.content_id,p.version) from public.fb_progress p),
    'documents',(select jsonb_agg(to_jsonb(d) order by d.id) from public.fb_documents d),
    'coverage',(select jsonb_agg(to_jsonb(c) order by c.user_id,c.content_id) from public.fb_assignment_coverage() c),
    'members',(select jsonb_agg(jsonb_build_object('person',p.id,'groups',(select jsonb_agg(g.id order by g.id) from public.fb_config c,public.fb_member_group_tree(p.groups,p.team_id,c.groups,c.teams) g)) order by p.id) from public.fb_profiles p)
  ) as value`,
  );
}

test("Organization upgrade adds an empty protected root without altering subtree/direct coverage or saved history", async () => {
  const pg = await fixture();
  try {
    const before = await fingerprint(pg);
    const previous = await value(
      pg,
      "select to_jsonb(c) as value from public.fb_config c",
    );
    await migrate(pg, migration);
    const after = await value(
      pg,
      "select to_jsonb(c) as value from public.fb_config c",
    );
    assert.deepEqual(await fingerprint(pg), before);
    const root = after.teams.find((t: any) => t.system === "organization");
    assert.equal(after.settings.organizationTeamId, root.id);
    assert.equal(root.name, "Organization");
    assert.equal(root.managerId, undefined);
    assert.equal(
      after.teams.find((t: any) => t.id === "sales").parentId,
      root.id,
    );
    assert.equal(
      after.teams.find((t: any) => t.id === "other").parentId,
      root.id,
    );
    assert.equal(
      after.teams.find((t: any) => t.id === "leaf").parentId,
      "sales",
    );
    assert.equal(after.revision, previous.revision + 1);
    assert.equal(after.governance_revision, previous.governance_revision + 1);
    assert.equal(
      (
        await value(pg, "select public.fb_governance_snapshot($1) as value", [
          manager,
        ])
      ).teams.length,
      2,
    );
    for (const mutate of [
      (data: any) =>
        (data.teams = data.teams.filter((t: any) => t.id !== root.id)),
      (data: any) =>
        (data.teams.find((t: any) => t.id === root.id).name = "Changed"),
      (data: any) =>
        (data.teams.find((t: any) => t.id === root.id).parentId = "sales"),
      (data: any) =>
        (data.teams.find((t: any) => t.id === root.id).system = undefined),
      (data: any) =>
        (data.teams.find((t: any) => t.id === "other").parentId = undefined),
    ])
      await assert.rejects(saveRoster(pg, admin, mutate));
    assert.deepEqual(await fingerprint(pg), before);
    await assert.rejects(
      pg.query(
        "update public.fb_config set settings=settings-'organizationTeamId'",
      ),
      /Organization/,
    );
    await assert.rejects(
      pg.query("delete from public.fb_config"),
      /Organization/,
    );
    await saveRoster(
      pg,
      admin,
      (data) =>
        (data.teams.find((t: any) => t.id === root.id).managerId = manager),
    );
    const report = await value(
      pg,
      "select public.fb_governance_snapshot($1) as value",
      [manager],
    );
    assert.equal(report.teams.length, 4);
    assert.equal(
      report.users.some((u: any) => u.id === admin),
      false,
    );
    assert.deepEqual(await fingerprint(pg), before);
    const grants = await value(
      pg,
      "select jsonb_build_object('anon',has_function_privilege('anon','public.fb_guard_organization()','execute'),'authenticated',has_function_privilege('authenticated','public.fb_validate_organization(jsonb,jsonb,jsonb,jsonb)','execute'),'service',has_function_privilege('service_role','public.fb_validate_organization(jsonb,jsonb,jsonb,jsonb)','execute')) as value",
    );
    assert.deepEqual(grants, {
      anon: false,
      authenticated: false,
      service: true,
    });
  } finally {
    await pg.close();
  }
});

test("Organization upgrade reuses only an explicitly selected sole root with its manager/direct members/name", async () => {
  const pg = await fixture(true);
  try {
    const before = await fingerprint(pg);
    await migrate(pg, migration);
    const cfg = await value(
      pg,
      "select to_jsonb(c) as value from public.fb_config c",
    );
    assert.equal(cfg.settings.organizationTeamId, "sales");
    assert.equal(cfg.teams.length, 2);
    assert.deepEqual(cfg.teams[0], {
      id: "sales",
      name: "Historical sales",
      managerId: manager,
      system: "organization",
    });
    assert.deepEqual(await fingerprint(pg), before);
  } finally {
    await pg.close();
  }
});

test("fresh installations receive Organization before any people or ordinary teams exist", async () => {
  const pg = await rosterDatabase();
  try {
    await migrate(pg, episodeMigration);
    await migrate(pg, contributorMigration);
    await migrate(pg, flatGroupMigration);
    await migrate(pg, migration);
    const cfg = await value(
      pg,
      "select to_jsonb(c) as value from public.fb_config c",
    );
    assert.equal(cfg.teams.length, 1);
    assert.equal(cfg.teams[0].name, "Organization");
    assert.equal(cfg.teams[0].id, cfg.settings.organizationTeamId);
    assert.equal(cfg.teams[0].managerId, undefined);
    assert.equal(
      await value(pg, "select count(*)::int as value from public.fb_profiles"),
      0,
    );
  } finally {
    await pg.close();
  }
});

const compatibility = process.env.FIELDBOOK_COMPAT_ASSIGNMENT_MIGRATION;
test(
  "independent Organization guard preserves direct assignment function bodies in either application order",
  { skip: !compatibility },
  async () => {
    const other = await readFile(compatibility!, "utf8");
    for (const beforeRoot of [true, false]) {
      const pg = await fixture();
      try {
        if (beforeRoot) await pg.exec(other);
        const before = await fingerprint(pg);
        const definition = beforeRoot
          ? await value(
              pg,
              "select pg_get_functiondef('public.fb_save_governance(uuid,integer,text,jsonb)'::regprocedure) as value",
            )
          : undefined;
        await migrate(pg, migration);
        assert.deepEqual(await fingerprint(pg), before);
        if (!beforeRoot) await pg.exec(other);
        if (definition)
          assert.equal(
            await value(
              pg,
              "select pg_get_functiondef('public.fb_save_governance(uuid,integer,text,jsonb)'::regprocedure) as value",
            ),
            definition,
          );
        const cfg = await value(
          pg,
          "select to_jsonb(c) as value from public.fb_config c",
        );
        assert.ok(cfg.teams.some((t: any) => t.system === "organization"));
        await saveRoster(
          pg,
          admin,
          (data: any) =>
            (data.teams.find((t: any) => t.id === "other").name =
              "Renamed other"),
        );
        assert.ok(
          (
            await value(
              pg,
              "select to_jsonb(c) as value from public.fb_config c",
            )
          ).teams.some((t: any) => t.name === "Renamed other"),
        );
      } finally {
        await pg.close();
      }
    }
  },
);
