import assert from "node:assert/strict";
import test from "node:test";
import { rosterDatabase, saveRoster, value } from "../helpers/roster-database";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function database() {
  const pg = await rosterDatabase();
  await pg.exec(`insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}');
    insert into fb_profiles(id,auth_user_id,email,name,role) values
    ('${id(1)}','${id(1)}','admin@example.test','Admin','admin'),
    ('${id(2)}','${id(2)}','manager@example.test','Manager','manager'),
    ('${id(3)}','${id(3)}','owner@example.test','Owner','admin');
    insert into fb_profiles(id,email,name,role,active) values
    ('${id(4)}','pending@example.test','Pending','learner',false);`);
  for (const fn of [
    "fb_delete_users(uuid,integer,jsonb,text)",
    "fb_save_governance(uuid,integer,text,jsonb)",
  ]) {
    assert.equal(
      await value(
        pg,
        "select has_function_privilege('anon',$1,'execute') or has_function_privilege('authenticated',$1,'execute') value",
        [`public.${fn}`],
      ),
      false,
    );
    assert.equal(
      await value(
        pg,
        "select has_function_privilege('service_role',$1,'execute') value",
        [`public.${fn}`],
      ),
      true,
    );
  }
  return pg;
}
const revision = (pg: Awaited<ReturnType<typeof rosterDatabase>>) =>
  value(pg, "select governance_revision value from fb_config where id");

test("manager deletion preserves teams, clears only successful references and keeps protection/recovery/history", async () => {
  const pg = await database();
  try {
    await saveRoster(pg, id(1), (p) => {
      const root = p.teams[0].id;
      p.teams.push(
        { id: "sales", name: "Sales", parentId: root, managerId: id(2) },
        {
          id: "protected",
          name: "Protected",
          parentId: root,
          managerId: id(3),
        },
      );
      p.users.find((u: any) => u.id === id(2)).teamId = "sales";
    });
    await pg.exec(
      `insert into fb_mcp_grants(user_id,client_id,client_name) values('${id(2)}','client','Client');`,
    );
    const rev = await revision(pg);
    await assert.rejects(
      value(pg, "select fb_delete_users($1,$2,$3,$4) value", [
        id(4),
        rev,
        JSON.stringify([id(2)]),
        "owner@example.test",
      ]),
      /Administrator/,
    );
    await assert.rejects(
      value(pg, "select fb_delete_users($1,$2,$3,$4) value", [
        id(1),
        rev - 1,
        JSON.stringify([id(2)]),
        "owner@example.test",
      ]),
      /Revision/,
    );
    const before = await value(
      pg,
      "select teams value from fb_config where id",
    );
    const result = await value(
      pg,
      "select fb_delete_users($1,$2,$3,$4) value",
      [id(1), rev, JSON.stringify([id(1), id(3), id(2)]), "owner@example.test"],
    );
    assert.deepEqual(
      result.map((r: any) => r.status),
      ["failed", "failed", "changed"],
    );
    assert.deepEqual(
      await value(pg, "select teams value from fb_config where id"),
      before.map((t: any) => {
        if (t.managerId !== id(2)) return t;
        const { managerId, ...rest } = t;
        return rest;
      }),
    );
    assert.equal(await revision(pg), rev + 1);
    assert.equal(
      await value(
        pg,
        "select enabled value from fb_mcp_grants where user_id=$1",
        [id(2)],
      ),
      false,
    );
    assert.equal(
      await value(
        pg,
        "select count(*)::int value from fb_deleted_items where id=$1",
        [id(2)],
      ),
      1,
    );
    assert.equal(
      await value(pg, "select fb_delete_users($1,$2,$3,$4) value", [
        id(1),
        rev + 1,
        JSON.stringify([id(2)]),
        "owner@example.test",
      ]).then((r: any) => r[0].status),
      "unchanged",
    );
    assert.equal(await revision(pg), rev + 1);
    await pg.query("update fb_deleted_items set auth_locked=true where id=$1", [
      id(2),
    ]);
    await value(pg, "select fb_restore_deleted($1,'user',$2,1) value", [
      id(1),
      id(2),
    ]);
    assert.deepEqual(
      await value(
        pg,
        "select jsonb_build_object('active',active,'role',role,'team',team_id) value from fb_profiles where id=$1",
        [id(2)],
      ),
      { active: false, role: "learner", team: null },
    );
    assert.equal(
      await value(
        pg,
        "select exists(select 1 from fb_config,jsonb_array_elements(teams) t where t->>'managerId'=$1) value",
        [id(2)],
      ),
      false,
    );
  } finally {
    await pg.close();
  }
});

test("populated teams delete atomically to Organization; parent destinations, incorrectly moved children, learning links and stale saves are rejected", async () => {
  const pg = await database();
  try {
    const root = await value(
      pg,
      "select settings->>'organizationTeamId' value from fb_config where id",
    );
    await saveRoster(pg, id(1), (p) => {
      p.teams.push(
        { id: "parent", name: "Parent", parentId: root },
        { id: "branch", name: "Branch", parentId: "parent" },
        { id: "child", name: "Child", parentId: "branch" },
      );
      p.users.find((u: any) => u.id === id(2)).teamId = "branch";
      p.users.find((u: any) => u.id === id(4)).teamId = "child";
    });
    await pg.exec(
      `insert into fb_documents(id,draft,published) values('${id(10)}','{"id":"${id(10)}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}','{"id":"${id(10)}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}');`,
    );
    await saveRoster(pg, id(1), (p) => {
      p.teams[0].learningItems = [{ kind: "course", id: id(10) }];
    });
    await pg.exec(
      `insert into fb_progress(user_id,content_id,version,lessons,passed) values('${id(2)}','${id(10)}',1,'[]',true);`,
    );
    const episodes = await value(
      pg,
      "select jsonb_agg(to_jsonb(a) order by user_id) value from fb_assignment_episodes a",
    );
    const progress = await value(
      pg,
      "select jsonb_agg(to_jsonb(p)) value from fb_progress p",
    );
    const before = await value(
      pg,
      "select to_jsonb(c) value from fb_config c where id",
    );
    const deleteBranch = (p: any, destination: string | null = null) => {
      p.teams = p.teams.filter((t: any) => !["branch", "child"].includes(t.id));
      p.users.forEach((u: any) => {
        if ([id(2), id(4)].includes(u.id)) u.teamId = destination;
      });
    };
    await assert.rejects(
      saveRoster(pg, id(1), (p) => deleteBranch(p, "parent")),
      /direct users to Organization/,
    );
    await assert.rejects(
      saveRoster(pg, id(1), (p) => {
        p.teams = p.teams.filter((t: any) => t.id !== "branch");
        p.teams.find((t: any) => t.id === "child").parentId = "parent";
        p.users.find((u: any) => u.id === id(2)).teamId = null;
      }),
      /subteams/,
    );
    await assert.rejects(
      saveRoster(pg, id(1), (p) => {
        p.teams = p.teams.filter((t: any) => t.id !== root);
      }),
      /assigned learning|Organization|Parent does not exist/i,
    );
    assert.deepEqual(
      await value(pg, "select to_jsonb(c) value from fb_config c where id"),
      before,
      "blocked deletes leave config and revision intact",
    );
    for (const legacy of [false, true]) {
      if (legacy) {
        // Existing sources created before the flat-group conversion remain protected.
        await pg.query("update fb_config set groups=$1 where id", [
          JSON.stringify([
            {
              id: "group",
              name: "Group",
              learningItems: [],
              legacyDirectTeamIds: ["branch"],
            },
          ]),
        ]);
      } else
        await saveRoster(pg, id(1), (p) => {
          p.groups = [
            {
              id: "group",
              name: "Group",
              learningItems: [],
              teamIds: ["branch"],
            },
          ];
        });
      await assert.rejects(
        saveRoster(pg, id(1), (p) => {
          deleteBranch(p);
          p.groups = [];
        }),
        /learning.group|Group team/i,
      );
      await saveRoster(pg, id(1), (p) => {
        p.groups = [];
      });
    }
    await saveRoster(pg, id(1), (p) => {
      p.teams.find((t: any) => t.id === "branch").learningItems = [
        { kind: "course", id: id(10) },
      ];
    });
    await assert.rejects(
      saveRoster(pg, id(1), (p) => deleteBranch(p)),
      /assigned learning/,
    );
    await saveRoster(pg, id(1), (p) => {
      p.teams.find((t: any) => t.id === "branch").learningItems = [];
    });
    const snapshot = await value(
      pg,
      "select fb_admin_people_snapshot($1) value",
      [id(1)],
    );
    await assert.rejects(
      value(pg, "select fb_save_governance($1,$2,'save',$3) value", [
        id(1),
        snapshot.revision - 1,
        "{}",
      ]),
      /Revision/,
    );
    await saveRoster(pg, id(1), (p) => deleteBranch(p));
    assert.equal(
      await value(
        pg,
        "select count(*)::int value from fb_profiles where id in($1,$2) and team_id is null and deleted_at is null",
        [id(2), id(4)],
      ),
      2,
    );
    assert.equal(
      await value(
        pg,
        "select exists(select 1 from fb_config,jsonb_array_elements(teams) t where t->>'id'='parent') value",
      ),
      true,
    );
    assert.deepEqual(
      await value(
        pg,
        "select jsonb_agg(to_jsonb(a) order by user_id) value from fb_assignment_episodes a",
      ),
      episodes,
      "continuous Organization course episodes/deadlines preserved",
    );
    assert.deepEqual(
      await value(pg, "select jsonb_agg(to_jsonb(p)) value from fb_progress p"),
      progress,
      "progress preserved",
    );
  } finally {
    await pg.close();
  }
});

test("deleting a middle team promotes only surviving immediate subteams and keeps their users and nested branches", async () => {
  const pg = await database();
  try {
    const root = await value(
      pg,
      "select settings->>'organizationTeamId' value from fb_config where id",
    );
    await saveRoster(pg, id(1), (p) => {
      p.teams.push(
        { id: "parent", name: "Parent", parentId: root },
        { id: "deleted", name: "Deleted", parentId: "parent" },
        {
          id: "survivor",
          name: "Survivor",
          parentId: "deleted",
          managerId: id(2),
        },
        { id: "nested", name: "Nested", parentId: "survivor" },
      );
      p.users.find((u: any) => u.id === id(2)).teamId = "survivor";
      p.users.find((u: any) => u.id === id(4)).teamId = "nested";
      p.users.find((u: any) => u.id === id(3)).teamId = "deleted";
    });
    const profiles = await value(
      pg,
      "select jsonb_agg(to_jsonb(p) order by id) value from fb_profiles p where id<>$1",
      [id(3)],
    );
    const teams = await value(pg, "select teams value from fb_config where id");
    await saveRoster(pg, id(1), (p) => {
      p.teams = p.teams
        .filter((t: any) => t.id !== "deleted")
        .map((t: any) => (t.id === "survivor" ? { ...t, parentId: root } : t));
      p.users.find((u: any) => u.id === id(3)).teamId = null;
    });
    assert.deepEqual(
      await value(pg, "select teams value from fb_config where id"),
      teams
        .filter((t: any) => t.id !== "deleted")
        .map((t: any) => (t.id === "survivor" ? { ...t, parentId: root } : t)),
    );
    assert.deepEqual(
      await value(
        pg,
        "select jsonb_agg(to_jsonb(p) order by id) value from fb_profiles p where id<>$1",
        [id(3)],
      ),
      profiles,
      "surviving team users and their identities stay intact",
    );
    assert.equal(
      await value(pg, "select team_id value from fb_profiles where id=$1", [
        id(3),
      ]),
      null,
    );
  } finally {
    await pg.close();
  }
});
