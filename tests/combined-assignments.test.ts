import assert from "node:assert/strict";
import test from "node:test";
import { rosterDatabase, saveRoster, value } from "./helpers/roster-database";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fingerprints(pg: Awaited<ReturnType<typeof rosterDatabase>>) {
  return value(
    pg,
    `select jsonb_build_object(
    'people',(select jsonb_agg(to_jsonb(p) order by id) from fb_profiles p),
    'progress',(select jsonb_agg(to_jsonb(p) order by user_id,content_id,version) from fb_progress p),
    'episodes',(select jsonb_agg(to_jsonb(e) order by id) from fb_assignment_episodes e),
    'documents',(select jsonb_agg(to_jsonb(d) order by id) from fb_documents d)
  ) value`,
  );
}
test("combined team/group assignments preserve continuous obligations, history and administrator boundaries", async () => {
  const pg = await rosterDatabase();
  try {
    await pg.exec(`insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}');
      insert into fb_profiles(id,auth_user_id,name,email,role,team_id,hire_date,onboarding_days) values
      ('${id(1)}','${id(1)}','Admin','admin@example.test','admin',null,null,null),
      ('${id(2)}','${id(2)}','Manager','manager@example.test','contributor',null,null,null),
      ('${id(3)}','${id(3)}','Child','child@example.test','learner','child','2026-01-01',90),
      ('${id(4)}','${id(4)}','Direct','direct@example.test','learner','sales','2026-01-01',90),
      ('${id(5)}',null,'Pending','pending@example.test','learner',null,null,null);
      update fb_config set settings=settings||'{"catchUpDays":7,"onboardingDays":90}',
        teams=teams||jsonb_build_array(jsonb_build_object('id','sales','name','Sales','parentId',settings->>'organizationTeamId'),jsonb_build_object('id','child','name','Child','parentId','sales'),jsonb_build_object('id','other','name','Other','parentId',settings->>'organizationTeamId')),
        groups='[{"id":"direct","name":"Direct","teamIds":[],"legacyDirectTeamIds":["sales"],"learningItems":[{"kind":"course","id":"${id(10)}"}]},{"id":"branch","name":"Branch","teamIds":["sales"],"legacyDirectTeamIds":[],"learningItems":[{"kind":"course","id":"${id(10)}"}]}]';
      insert into fb_documents(id,draft,published) values('${id(10)}','{"id":"${id(10)}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}','{"id":"${id(10)}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}');
      select fb_sync_learning();
      insert into fb_progress(user_id,content_id,version,lessons,passed) values('${id(3)}','${id(10)}',1,'[]',true);`);
    const cfg = await value(pg, "select to_jsonb(c) value from fb_config c");
    const root = cfg.settings.organizationTeamId;
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
    assert.deepEqual(swapped.sourceAudiences, [{ kind: "team", id: "sales" }]);
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
      (await value(pg, "select to_jsonb(c) value from fb_config c")).teams.some(
        (t: any) => t.id === "other",
      ),
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
    const snap = await value(pg, "select fb_admin_people_snapshot($1) value", [
      id(1),
    ]);
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
        delete d.groups.find((g: any) => g.id === "direct").legacyDirectTeamIds;
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
      await value(pg, "select passed value from fb_progress where user_id=$1", [
        id(3),
      ]),
      true,
    );
  } finally {
    await pg.close();
  }
});
