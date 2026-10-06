import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  rosterDatabase,
  migrate,
  episodeMigration,
  contributorMigration,
  flatGroupMigration,
  saveRoster,
  value,
} from "./helpers/roster-database";
const rootMigration = "20261002135103_builtin_organization_team.sql",
  fallback = "20261002184642_organization_membership.sql",
  mixed = "20261002064454_team_group_course_assignments.sql",
  combined = "20261002210106_combined_assignment_organization.sql",
  safeguards = "20261002214011_combined_governance_safeguards.sql";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fingerprints(pg: Awaited<ReturnType<typeof rosterDatabase>>) {
  return value(
    pg,
    `select jsonb_build_object(
 'people',(select jsonb_agg(to_jsonb(p) order by id) from fb_profiles p),
 'progress',(select jsonb_agg(to_jsonb(p) order by user_id,content_id,version) from fb_progress p),
 'episodes',(select jsonb_agg(to_jsonb(e)-'source_audiences' order by id) from fb_assignment_episodes e),
 'coverage',(select jsonb_agg(to_jsonb(c) order by user_id,content_id) from fb_assignment_coverage() c),
 'documents',(select jsonb_agg(to_jsonb(d) order by id) from fb_documents d)
 ) value`,
  );
}
async function populatedHistory(
  pg: Awaited<ReturnType<typeof rosterDatabase>>,
  order: string,
) {
  if (order.startsWith("production")) {
    await migrate(pg, contributorMigration);
    await migrate(pg, episodeMigration);
  } else {
    await migrate(pg, episodeMigration);
    await migrate(pg, contributorMigration);
  }
  await pg.exec(`insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}');
   insert into fb_profiles(id,auth_user_id,name,email,role,team_id,hire_date,onboarding_days) values
   ('${id(1)}','${id(1)}','Admin','admin@example.test','admin',null,null,null),
   ('${id(2)}','${id(2)}','Manager','manager@example.test','contributor',null,null,null),
   ('${id(3)}','${id(3)}','Child','child@example.test','learner','child','2026-01-01',90),
   ('${id(4)}','${id(4)}','Direct','direct@example.test','learner','sales','2026-01-01',90),
   ('${id(5)}',null,'Pending','pending@example.test','learner',null,null,null);
   update fb_config set settings=settings||'{"catchUpDays":7,"onboardingDays":90}',teams='[{"id":"sales","name":"Sales"},{"id":"child","name":"Child","parentId":"sales"},{"id":"other","name":"Other"}]',groups='[{"id":"direct","name":"Direct","teamIds":["sales"],"teamLinkScope":"direct","learningItems":[{"kind":"course","id":"${id(10)}"}]},{"id":"branch","name":"Branch","teamIds":["sales"],"teamLinkScope":"subtree","learningItems":[{"kind":"course","id":"${id(10)}"}]}]';
   insert into fb_documents(id,draft,published) values('${id(10)}','{"id":"${id(10)}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}','{"id":"${id(10)}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}'); select fb_sync_learning();
   insert into fb_progress(user_id,content_id,version,lessons,passed) values('${id(3)}','${id(10)}',1,'[]',true);`);
  let typedBeforeFlat: unknown;
  if (order === "production-typed-first") {
    await migrate(pg, mixed);
    await pg.exec(
      `insert into fb_documents(id,draft,published) values('${id(11)}','{"id":"${id(11)}","kind":"course","title":"Team-only course","status":"published","version":1,"lessons":[]}','{"id":"${id(11)}","kind":"course","title":"Team-only course","status":"published","version":1,"lessons":[]}');`,
    );
    await saveRoster(pg, id(1), (d) => {
      d.teams.find((t: any) => t.id === "sales").learningItems = [
        { kind: "course", id: id(10) },
        { kind: "course", id: id(11) },
      ];
    });
    const active = await value(pg, "select fb_person_assignments($1) value", [
      id(3),
    ]);
    assert.equal(active.length, 2);
    assert.ok(
      active
        .find((a: any) => a.contentId === id(10))
        .sourceAudiences.some((a: any) => a.kind === "group"),
    );
    assert.ok(
      active
        .find((a: any) => a.contentId === id(10))
        .sourceAudiences.some((a: any) => a.kind === "team"),
    );
    assert.deepEqual(
      active.find((a: any) => a.contentId === id(11)).sourceAudiences,
      [{ kind: "team", id: "sales" }],
    );
    typedBeforeFlat = await fingerprints(pg);
  }
  return typedBeforeFlat;
}

for (const order of [
  "fresh",
  "preview-upgrade",
  "production-upgrade",
  "production-typed-first",
] as const)
  test(`combined assignments preserve flat/root contracts and saved records: ${order}`, async () => {
    const pg = await rosterDatabase();
    try {
      const typedBeforeFlat = await populatedHistory(pg, order);
      await migrate(pg, flatGroupMigration);
      const baseline = await fingerprints(pg);
      if (typedBeforeFlat)
        assert.deepEqual(
          baseline,
          typedBeforeFlat,
          "flat conversion preserves populated typed episodes and Team-only coverage",
        );
      if (order !== "preview-upgrade" && order !== "production-typed-first")
        await migrate(pg, mixed);
      await migrate(pg, rootMigration);
      await migrate(pg, fallback);
      if (order === "preview-upgrade") await migrate(pg, mixed);
      assert.deepEqual(await fingerprints(pg), baseline);
      const before = await value(
        pg,
        "select to_jsonb(c) value from fb_config c",
      );
      const episodesBefore = await value(
        pg,
        "select jsonb_agg(to_jsonb(e) order by id) value from fb_assignment_episodes e",
      );
      await assert.rejects(
        migrate(pg, safeguards),
        /Apply the combined assignment\/Organization successor/,
      );
      await pg.exec("rollback");
      assert.deepEqual(await fingerprints(pg), baseline);
      await migrate(pg, combined);
      assert.deepEqual(await fingerprints(pg), baseline);
      assert.deepEqual(
        await value(
          pg,
          "select jsonb_agg(to_jsonb(e) order by id) value from fb_assignment_episodes e",
        ),
        episodesBefore,
      );
      const cfg = await value(pg, "select to_jsonb(c) value from fb_config c");
      assert.equal(cfg.governance_revision, before.governance_revision + 1);
      assert.deepEqual(
        { ...cfg, governance_revision: before.governance_revision },
        before,
      );
      const beforeRepair = await fingerprints(pg);
      const repairEpisodes = await value(
        pg,
        "select jsonb_agg(to_jsonb(e) order by id) value from fb_assignment_episodes e",
      );
      await migrate(pg, safeguards);
      assert.deepEqual(await fingerprints(pg), beforeRepair);
      assert.deepEqual(
        await value(
          pg,
          "select jsonb_agg(to_jsonb(e) order by id) value from fb_assignment_episodes e",
        ),
        repairEpisodes,
      );
      const repaired = await value(
        pg,
        "select to_jsonb(c) value from fb_config c",
      );
      assert.equal(repaired.governance_revision, cfg.governance_revision + 1);
      assert.deepEqual(
        { ...repaired, governance_revision: cfg.governance_revision },
        cfg,
      );
      assert.equal(
        await value(
          pg,
          "select has_function_privilege('authenticated','fb_save_governance(uuid,integer,text,jsonb)','execute') value",
        ),
        false,
      );
      assert.equal(
        await value(
          pg,
          "select has_function_privilege('service_role','fb_save_governance(uuid,integer,text,jsonb)','execute') value",
        ),
        true,
      );
      const root = cfg.settings.organizationTeamId;
      if (order === "production-typed-first") {
        assert.deepEqual(
          cfg.teams.find((t: any) => t.id === "sales").learningItems,
          [
            { kind: "course", id: id(10) },
            { kind: "course", id: id(11) },
          ],
        );
        const current = await value(
          pg,
          "select fb_person_assignments($1) value",
          [id(3)],
        );
        assert.equal(current.length, 2);
        assert.deepEqual(
          current.find((a: any) => a.contentId === id(11)).sourceAudiences,
          [{ kind: "team", id: "sales" }],
        );
      }

      assert.deepEqual(
        await value(
          pg,
          "select jsonb_agg(id order by id) value from fb_member_groups('[]','child',(select groups from fb_config))",
        ),
        ["branch"],
      );
      await saveRoster(pg, id(1), (d) => {
        d.teams.find((t: any) => t.id === root).managerId = id(2);
      });
      const scope = await value(pg, "select fb_governance_snapshot($1) value", [
        id(2),
      ]);
      assert.ok(
        scope.users.some((p: any) => p.id === id(5)),
        "Organization manager includes implicit-root pending people",
      );
      assert.equal(scope.users.length, 5);
      const episode = (
        await value(pg, "select fb_person_assignments($1) value", [id(3)])
      )[0];
      await saveRoster(pg, id(1), (d) => {
        d.groups = d.groups.map((g: any) => ({ ...g, learningItems: [] }));
        d.teams.find((t: any) => t.id === "sales").learningItems = [
          { kind: "course", id: id(10) },
        ];
      });
      const swapped = (
        await value(pg, "select fb_person_assignments($1) value", [id(3)])
      )[0];
      assert.equal(swapped.episodeId, episode.episodeId);
      assert.equal(swapped.dueDate, episode.dueDate);
      assert.equal(swapped.assignedAt, episode.assignedAt);
      assert.deepEqual(swapped.sourceAudiences, [
        { kind: "team", id: "sales" },
      ]);
      await saveRoster(pg, id(1), (d) => {
        d.teams.find((t: any) => t.id === "other").learningItems = [
          { kind: "course", id: id(10) },
        ];
      });
      const deletionBefore = await fingerprints(pg);
      const deletionConfig = await value(
        pg,
        "select to_jsonb(c) value from fb_config c",
      );
      await assert.rejects(
        saveRoster(pg, id(1), (d) => {
          d.teams = d.teams.filter((t: any) => t.id !== "other");
        }),
        /Remove assigned learning before deleting a team/,
      );
      assert.deepEqual(await fingerprints(pg), deletionBefore);
      assert.deepEqual(
        await value(pg, "select to_jsonb(c) value from fb_config c"),
        deletionConfig,
      );
      // Removing the plan is a separate reviewed save; an empty unreferenced Team can be deleted.
      await saveRoster(pg, id(1), (d) => {
        d.teams.find((t: any) => t.id === "other").learningItems = [];
      });
      const emptyEpisodes = await value(
        pg,
        "select jsonb_agg(to_jsonb(e) order by id) value from fb_assignment_episodes e",
      );
      await saveRoster(pg, id(1), (d) => {
        d.teams = d.teams.filter((t: any) => t.id !== "other");
      });
      assert.equal(
        (
          await value(pg, "select to_jsonb(c) value from fb_config c")
        ).teams.some((t: any) => t.id === "other"),
        false,
      );
      assert.deepEqual(
        await value(
          pg,
          "select jsonb_agg(to_jsonb(e) order by id) value from fb_assignment_episodes e",
        ),
        emptyEpisodes,
      );
      const unchanged = await fingerprints(pg);
      await assert.rejects(
        saveRoster(pg, id(1), (d) => {
          d.teams = d.teams.filter((t: any) => t.id !== root);
        }),
        /Organization|Parent does not exist|subteams/,
      );

      for (const actor of [id(2), id(3), id(5)])
        await assert.rejects(
          saveRoster(pg, actor, () => {}),
          /Administrator/,
        );
      const snap = await value(
        pg,
        "select fb_admin_people_snapshot($1) value",
        [id(1)],
      );
      await assert.rejects(
        pg.query("select fb_save_governance($1,$2,'save',$3)", [
          id(1),
          snap.revision - 1,
          {},
        ]),
        /Revision/,
      );
      await assert.rejects(
        saveRoster(pg, id(1), (d) => {
          d.teams.find((t: any) => t.id === root).name = "Renamed";
          d.users.find((p: any) => p.id === id(3)).groups = ["direct"];
        }),
        /Organization/,
      );
      await assert.rejects(
        saveRoster(pg, id(1), (d) => {
          delete d.teams.find((t: any) => t.id === root).system;
        }),
        /Organization/,
      );
      await assert.rejects(
        saveRoster(pg, id(1), (d) => {
          d.groups
            .find((g: any) => g.id === "direct")
            .legacyDirectTeamIds.push("child");
        }),
        /New team links/,
      );
      await assert.rejects(
        saveRoster(pg, id(1), (d) => {
          delete d.groups.find((g: any) => g.id === "direct")
            .legacyDirectTeamIds;
        }),
        /Learning links/,
      );
      assert.deepEqual(
        await fingerprints(pg),
        unchanged,
        "all denied saves roll back profiles and obligations",
      );
      assert.equal(
        await value(
          pg,
          "select has_function_privilege('authenticated','fb_governance_snapshot(uuid)','execute') value",
        ),
        false,
      );
      assert.deepEqual(
        (
          await value(
            pg,
            "select fb_profile_learning(p) value from fb_profiles p where id=$1",
            [id(3)],
          )
        ).assignment_teams.map((t: any) => t.id),
        ["sales"],
      );
      await saveRoster(pg, id(1), (d) => {
        d.teams.find((t: any) => t.id === root).learningItems = [
          { kind: "course", id: id(10) },
        ];
      });
      const implicit = (
        await value(pg, "select fb_person_assignments($1) value", [id(5)])
      )[0];
      assert.deepEqual(implicit.sourceAudiences, [{ kind: "team", id: root }]);
      assert.equal(
        await value(pg, "select team_id value from fb_profiles where id=$1", [
          id(5),
        ]),
        null,
      );
      assert.equal(
        await value(
          pg,
          "select passed value from fb_progress where user_id=$1",
          [id(3)],
        ),
        true,
      );
    } finally {
      await pg.close();
    }
  });

test("actual Production missing migrations commit atomically without losing typed plans or obligations", async () => {
  const pg = await rosterDatabase();
  try {
    await populatedHistory(pg, "production-typed-first");
    const before = await fingerprints(pg);
    const episodes = await value(
      pg,
      "select jsonb_agg(to_jsonb(e) order by id) value from fb_assignment_episodes e",
    );
    const previous = await value(
      pg,
      "select to_jsonb(c) value from fb_config c",
    );
    const sources = await Promise.all(
      [flatGroupMigration, rootMigration, fallback, combined, safeguards].map(
        async (name) => {
          const sql = await readFile(
            new URL(`../supabase/history/initial-development/${name}`, import.meta.url),
            "utf8",
          );
          assert.match(sql, /^begin;$/m);
          assert.match(sql, /commit;\s*$/);
          return sql.replace(/^begin;\s*\n/m, "").replace(/commit;\s*$/, "");
        },
      ),
    );
    // Stable and typed migrations are already installed; only the five missing steps run here.
    await pg.exec(`begin;\n${sources.join("\n")}\ncommit;`);
    assert.deepEqual(await fingerprints(pg), before);
    assert.deepEqual(
      await value(
        pg,
        "select jsonb_agg(to_jsonb(e) order by id) value from fb_assignment_episodes e",
      ),
      episodes,
    );
    const cfg = await value(pg, "select to_jsonb(c) value from fb_config c");
    assert.equal(cfg.governance_revision, previous.governance_revision + 5);
    assert.equal(cfg.revision, previous.revision + 1);
    assert.deepEqual(
      cfg.teams.find((t: any) => t.id === "sales").learningItems,
      [
        { kind: "course", id: id(10) },
        { kind: "course", id: id(11) },
      ],
    );
    const root = cfg.settings.organizationTeamId;
    assert.equal(
      cfg.teams.find((t: any) => t.id === root).system,
      "organization",
    );
    await saveRoster(pg, id(1), (d) => {
      d.teams.find((t: any) => t.id === root).managerId = id(2);
    });
    const report = await value(pg, "select fb_governance_snapshot($1) value", [
      id(2),
    ]);
    assert.equal(report.users.length, 5);
    assert.deepEqual(
      report.users
        .find((p: any) => p.id === id(3))
        .assignment_teams.map((t: any) => t.id),
      ["sales"],
    );
    const denied = await fingerprints(pg);
    await assert.rejects(
      saveRoster(pg, id(2), () => {}),
      /Administrator/,
    );
    const snapshot = await value(
      pg,
      "select fb_admin_people_snapshot($1) value",
      [id(1)],
    );
    await assert.rejects(
      pg.query("select fb_save_governance($1,$2,'save',$3)", [
        id(1),
        snapshot.revision - 1,
        {},
      ]),
      /Revision/,
    );
    await assert.rejects(
      saveRoster(pg, id(1), (d) => {
        d.teams = d.teams.filter((t: any) => t.id !== root);
      }),
      /Organization|Parent does not exist|subteams/,
    );
    assert.deepEqual(await fingerprints(pg), denied);
    await saveRoster(pg, id(1), (d) => {
      d.teams.find((t: any) => t.id === "other").learningItems = [
        { kind: "course", id: id(10) },
      ];
    });
    await assert.rejects(
      saveRoster(pg, id(1), (d) => {
        d.teams = d.teams.filter((t: any) => t.id !== "other");
      }),
      /Remove assigned learning/,
    );
  } finally {
    await pg.close();
  }
});
