import assert from "node:assert/strict";
import test from "node:test";
import { database, seedProfile } from "./helpers/database.mjs";
import { saveRoster, value } from "./helpers/roster-database";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("initial configuration has one protected Organization team, private media and scheduled cleanup", async () => {
  const pg = await database();
  try {
    const config = await value(pg, "select to_jsonb(c) value from fb_config c");
    assert.equal(config.revision, 1);
    assert.equal(config.governance_revision, 1);
    assert.equal(config.teams.length, 1);
    assert.equal(config.teams[0].name, "Organization");
    assert.equal(config.teams[0].id, config.settings.organizationTeamId);
    assert.equal(config.teams[0].system, "organization");
    assert.deepEqual(config.groups, []);
    assert.deepEqual(config.curricula, []);
    assert.equal(
      await value(pg, "select count(*)::int value from fb_profiles"),
      0,
    );
    assert.equal(
      await value(
        pg,
        "select public value from storage.buckets where id='fieldbook-media'",
      ),
      false,
    );
    assert.equal(
      await value(pg, "select endpoint value from fb_cleanup_config"),
      null,
    );
    assert.equal(
      await value(
        pg,
        "select schedule value from cron.job where jobname='fieldbook-purge-deleted'",
      ),
      "17 * * * *",
    );
    await assert.rejects(pg.exec("delete from fb_config"), /Organization/);
    await assert.rejects(
      pg.exec("update fb_config set settings=settings-'organizationTeamId'"),
      /Organization/,
    );
  } finally {
    await pg.close();
  }
});

test("Organization identity cannot change and denied roster saves preserve people and configuration", async () => {
  const pg = await database();
  try {
    await seedProfile(pg, id(1), { role: "admin" });
    await seedProfile(pg, id(2), { role: "learner" });
    await saveRoster(pg, id(1), (d) => {
      d.teams.push({ id: "sales", name: "Sales", parentId: d.teams[0].id });
    });
    const before = await value(
      pg,
      "select jsonb_build_object('config',(select to_jsonb(c) from fb_config c),'people',(select jsonb_agg(to_jsonb(p) order by id) from fb_profiles p)) value",
    );
    const root = before.config.settings.organizationTeamId;
    for (const change of [
      (d: any) => {
        d.teams = d.teams.filter((t: any) => t.id !== root);
      },
      (d: any) => {
        d.teams[0].name = "Changed";
      },
      (d: any) => {
        delete d.teams[0].system;
      },
      (d: any) => {
        d.teams[0].parentId = "sales";
      },
      (d: any) => {
        delete d.teams.find((t: any) => t.id === "sales").parentId;
      },
    ])
      await assert.rejects(saveRoster(pg, id(1), change));
    assert.deepEqual(
      await value(
        pg,
        "select jsonb_build_object('config',(select to_jsonb(c) from fb_config c),'people',(select jsonb_agg(to_jsonb(p) order by id) from fb_profiles p)) value",
      ),
      before,
    );
    await assert.rejects(
      saveRoster(pg, id(2), () => {}),
      /Administrator/,
    );
  } finally {
    await pg.close();
  }
});

test("implicit Organization membership includes pending people and preserves continuous deadlines across team moves", async () => {
  const pg = await database();
  try {
    await seedProfile(pg, id(1), { role: "admin" });
    await seedProfile(pg, id(2), { role: "manager" });
    await seedProfile(pg, id(3), { registered: false });
    await seedProfile(pg, id(4), { active: false });
    await pg.query(
      "insert into fb_documents(id,draft,published,published_revision) values($1,$2,$2,1)",
      [
        id(10),
        {
          id: id(10),
          kind: "course",
          title: "Course",
          version: 1,
          lessons: [],
        },
      ],
    );
    await saveRoster(pg, id(1), (d) => {
      const root = d.teams[0];
      root.managerId = id(2);
      root.learningItems = [{ kind: "course", id: id(10) }];
      d.teams.push(
        { id: "sales", name: "Sales", parentId: root.id },
        { id: "child", name: "Child", parentId: "sales" },
      );
    });
    const scope = await value(pg, "select fb_governance_snapshot($1) value", [
      id(2),
    ]);
    assert(scope.users.some((p: any) => p.id === id(3)));
    assert(!scope.users.some((p: any) => p.id === id(4)));
    const episode = (
      await value(pg, "select fb_person_assignments($1) value", [id(3)])
    )[0];
    assert(episode);
    await saveRoster(pg, id(1), (d) => {
      delete d.teams[0].managerId;
      d.teams.find((t: any) => t.id === "sales").managerId = id(2);
      d.users.find((p: any) => p.id === id(3)).teamId = "child";
    });
    assert(
      (
        await value(pg, "select fb_governance_snapshot($1) value", [id(2)])
      ).users.some((p: any) => p.id === id(3)),
    );
    await saveRoster(pg, id(1), (d) => {
      d.users.find((p: any) => p.id === id(3)).teamId = null;
    });
    assert(
      !(
        await value(pg, "select fb_governance_snapshot($1) value", [id(2)])
      ).users.some((p: any) => p.id === id(3)),
    );
    const retained = (
      await value(pg, "select fb_person_assignments($1) value", [id(3)])
    )[0];
    assert.equal(retained.episodeId, episode.episodeId);
    assert.equal(retained.dueDate, episode.dueDate);
    for (const role of ["anon", "authenticated"]) {
      await pg.exec("set role " + role);
      await assert.rejects(
        pg.query("select fb_governance_snapshot($1)", [id(2)]),
        /permission denied/,
      );
      await pg.exec("reset role");
    }
  } finally {
    await pg.close();
  }
});
