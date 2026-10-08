import assert from "node:assert/strict";
import test from "node:test";
import { database, seedProfile } from "./helpers/database.mjs";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Database = Awaited<ReturnType<typeof database>>;
const value = async (pg: Database, sql: string, args: unknown[] = []) =>
  (await pg.query<{ value: any }>(sql, args)).rows[0]?.value;

async function fixture() {
  const pg = await database();
  await seedProfile(pg, id(1), { role: "admin", email: "owner@example.test" });
  await seedProfile(pg, id(2), { role: "admin" });
  await seedProfile(pg, id(3), { registered: false });
  return pg;
}

async function removePerson(pg: Database, person: string, expired = true) {
  const expected = await value(
    pg,
    "select governance_revision value from fb_config",
  );
  await pg.query("select fb_delete_users($1,$2,$3,'owner@example.test')", [
    id(1),
    expected,
    JSON.stringify([person]),
  ]);
  await pg.query(
    `update fb_deleted_items set auth_locked=true, purging=$2, claim=$3,
    deleted_at=case when $2 then now()-interval '31 days' else deleted_at end,
    purge_after=case when $2 then now()-interval '1 second' else purge_after end
    where entity='user' and id=$1`,
    [person, expired, id(99)],
  );
}

async function media(pg: Database, asset: number, ready = true) {
  await pg.query(
    `insert into fb_media(id,path,filename,mime,bytes,owner,ready)
    values($1,$2,'image.png','image/png',16,$3,$4)`,
    [id(asset), `${id(2)}/${id(asset)}.png`, id(2), ready],
  );
}
const reference = (asset: number) => `/api/media/${id(asset)}.png`;

test("the current cleanup model omits retired helpers and keeps service-only permissions", async () => {
  const pg = await fixture();
  try {
    for (const fn of [
      "fb_assignment_coverage(uuid,uuid)",
      "fb_validate_learning_before_teams(jsonb,jsonb,jsonb)",
    ])
      assert.equal(
        await value(pg, "select to_regprocedure($1)::text value", [fn]),
        null,
      );
    for (const fn of [
      "fb_collect_deleted_media()",
      "fb_finish_deletion(text,uuid,uuid)",
    ])
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal(
          await value(
            pg,
            "select has_function_privilege($1,$2,'execute') value",
            [role, fn],
          ),
          role === "service_role",
        );
  } finally {
    await pg.close();
  }
});

test("expired preregistered-person purge removes the profile and its dependent records and frees the email", async () => {
  const pg = await fixture();
  try {
    await pg.query(
      "insert into fb_mcp_grants(user_id,client_id,client_name) values($1,'client','Client')",
      [id(3)],
    );
    const email = await value(
      pg,
      "select email value from fb_profiles where id=$1",
      [id(3)],
    );
    await removePerson(pg, id(3));
    await pg.query("select fb_finish_deletion('user',$1,$2)", [id(3), id(99)]);
    assert.equal(
      await value(
        pg,
        "select count(*)::int value from fb_profiles where id=$1",
        [id(3)],
      ),
      0,
    );
    assert.equal(
      await value(
        pg,
        "select count(*)::int value from fb_mcp_grants where user_id=$1",
        [id(3)],
      ),
      0,
    );
    assert.equal(
      await value(
        pg,
        "select count(*)::int value from fb_deleted_items where id=$1",
        [id(3)],
      ),
      0,
    );
    await seedProfile(pg, id(4), { registered: false, email });
    assert.equal(
      await value(pg, "select email value from fb_profiles where id=$1", [
        id(4),
      ]),
      email,
    );
    await assert.rejects(
      pg.query("select fb_finish_deletion('user',$1,$2)", [id(3), id(99)]),
      /claim expired/,
    );
  } finally {
    await pg.close();
  }
});

test("unexpired and restored pending people and stale claims cannot be purged", async () => {
  const pg = await fixture();
  try {
    await removePerson(pg, id(3), false);
    await assert.rejects(
      pg.query("select fb_finish_deletion('user',$1,$2)", [id(3), id(99)]),
      /claim expired/,
    );
    await pg.query("select fb_restore_deleted($1,'user',$2,1)", [id(1), id(3)]);
    await assert.rejects(
      pg.query("select fb_finish_deletion('user',$1,$2)", [id(3), id(99)]),
      /claim expired/,
    );
    assert.equal(
      await value(pg, "select deleted_at value from fb_profiles where id=$1", [
        id(3),
      ]),
      null,
    );
    await removePerson(pg, id(3));
    await assert.rejects(
      pg.query("select fb_finish_deletion('user',$1,$2)", [id(3), id(98)]),
      /claim expired/,
    );
    assert.equal(
      await value(
        pg,
        "select count(*)::int value from fb_profiles where id=$1",
        [id(3)],
      ),
      1,
    );
  } finally {
    await pg.close();
  }
});

test("linked people still require Auth deletion before finalization", async () => {
  const pg = await fixture();
  try {
    await removePerson(pg, id(2));
    await assert.rejects(
      pg.query("select fb_finish_deletion('user',$1,$2)", [id(2), id(99)]),
      /Delete the Auth account/,
    );
    assert.equal(
      await value(
        pg,
        "select count(*)::int value from fb_profiles where id=$1",
        [id(2)],
      ),
      1,
    );
    await pg.query("delete from auth.users where id=$1", [id(2)]);
    await pg.query("select fb_finish_deletion('user',$1,$2)", [id(2), id(99)]);
    assert.equal(
      await value(
        pg,
        "select count(*)::int value from fb_deleted_items where id=$1",
        [id(2)],
      ),
      0,
    );
  } finally {
    await pg.close();
  }
});

test("uploader purge preserves draft and published curriculum artwork after historical audit protection is cleared", async () => {
  const pg = await fixture();
  try {
    await media(pg, 10);
    await media(pg, 11);
    await media(pg, 12);
    const curricula = ["draft", "published"].map((status, i) => ({
      id: `curriculum-${i}`,
      name: `Curriculum ${i}`,
      description: "",
      status,
      courseIds: [],
      cardArt: {
        source: "upload",
        shortTitle: "",
        version: 6,
        seed: 1,
        imageUrl: reference(10 + i),
      },
    }));
    await pg.query("update fb_config set curricula=$1", [
      JSON.stringify(curricula),
    ]);
    await pg.query(
      "insert into fb_audit(actor,source,action,entity_id,snapshot) values($1,'web','governance_save','governance',$2)",
      [id(2), JSON.stringify({ users: [{ id: id(2) }], curricula })],
    );
    await removePerson(pg, id(2));
    await pg.query("delete from auth.users where id=$1", [id(2)]);
    await pg.query("select fb_finish_deletion('user',$1,$2)", [id(2), id(99)]);
    assert.equal(
      await value(
        pg,
        "select count(*)::int value from fb_audit where snapshot is not null",
      ),
      0,
    );
    const collected = (
      await pg.query<{ id: string }>(
        "select id from fb_collect_deleted_media()",
      )
    ).rows;
    assert.deepEqual(collected, [{ id: id(12) }]);
    assert.deepEqual(
      await value(pg, "select curricula value from fb_config"),
      curricula,
    );
    assert.equal(
      await value(
        pg,
        "select bool_and(ready) value from fb_media where id=any($1::uuid[])",
        [[id(10), id(11)]],
      ),
      true,
    );
    assert.equal(
      await value(pg, "select ready value from fb_media where id=$1", [id(12)]),
      false,
    );
  } finally {
    await pg.close();
  }
});

test("curriculum references protect queued media and reject references added after retirement", async () => {
  const pg = await fixture();
  try {
    await media(pg, 10);
    await pg.query("insert into fb_media_cleanup(id) values($1)", [id(10)]);
    const curricula = [
      {
        id: "path",
        name: "Path",
        description: "",
        status: "draft",
        courseIds: [],
        cardArt: {
          source: "upload",
          shortTitle: "",
          version: 6,
          seed: 1,
          imageUrl: reference(10),
        },
      },
    ];
    await pg.query("update fb_config set curricula=$1", [
      JSON.stringify(curricula),
    ]);
    assert.deepEqual(
      (await pg.query("select * from fb_collect_deleted_media()")).rows,
      [],
    );
    await pg.exec("update fb_config set curricula='[]'");
    assert.equal(
      (await pg.query("select * from fb_collect_deleted_media()")).rows.length,
      1,
    );
    await assert.rejects(
      pg.query("update fb_config set curricula=$1", [
        JSON.stringify(curricula),
      ]),
      /permanently deleted/,
    );
    assert.deepEqual(
      await value(pg, "select curricula value from fb_config"),
      [],
    );
  } finally {
    await pg.close();
  }
});
