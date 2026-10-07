import assert from "node:assert/strict";
import test from "node:test";
import { database } from "./helpers/database.mjs";

test("Ask AI retrieves published windows, preserves data and search, and enforces service-only access", async () => {
  const pg = await database();
  try {
    const ids = Array.from(
      { length: 6 },
      (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
    const insert = async (index: number, published: unknown) =>
      pg.query(
        "insert into fb_documents(id,draft,published,published_revision) values($1,$2,$3,7)",
        [ids[index], { body: "draftsecret" }, published],
      );
    await insert(0, {
      kind: "course",
      title: "Distributed systems",
      lessons: Array.from({ length: 5 }, (_, i) => ({
        id: "lesson" + i,
        title: "Consensus " + i,
        body: "A quorum election selects a leader.",
      })),
      questions: [{ answer: "quizsecret" }],
    });
    await insert(1, {
      kind: "doc",
      title: "Database",
      body:
        "ordinary filler ".repeat(3000) +
        "The endmarker walarchive enables recovery from an outage.",
    });
    await insert(2, null);
    await insert(3, {
      kind: "doc",
      title: "Deleted",
      body: "deletedsecret quorum",
    });
    await insert(4, { kind: "brief", title: "News", body: "quorum election" });
    await insert(5, {
      kind: "doc",
      title: "Other system",
      body: "quorum election",
    });
    await pg.query("update fb_documents set deleted_at=now() where id=$1", [
      ids[3],
    ]);
    const beforeDocs = (
      await pg.query("select * from fb_documents order by id")
    ).rows;
    const beforeConfig = (await pg.query("select * from fb_config")).rows;
    const beforeSearch = (
      await pg.query("select fb_search('quorum','all',30) as results")
    ).rows;
    const search = async (
      queries: string[],
      kinds = ["doc", "brief", "course"],
    ) =>
      (
        await pg.query<{ results: any[] }>(
          "select fb_ai_passages($1,$2,12) as results",
          [queries, kinds],
        )
      ).rows[0].results;
    assert.deepEqual(await search([]), []);
    for (const secret of ["draftsecret", "quizsecret", "deletedsecret"])
      assert.deepEqual(await search([secret]), []);
    const result = await search(["quorum election"]);
    assert.equal(result.filter((row) => row.content_id === ids[0]).length, 3);
    assert.ok(result.some((row) => row.content_id === ids[5]));
    assert.ok(
      result.every(
        (row) =>
          row.published_revision === 7 &&
          !row.source_text.includes("deletedsecret"),
      ),
    );
    assert.ok(
      (await search(["quorum"], ["course"])).every(
        (row) => row.kind === "course",
      ),
    );
    const end = await search(["endmarker walarchive"]);
    assert.ok(
      end[0].source_text.includes("endmarker walarchive"),
      end[0].source_text,
    );
    assert.ok(end[0].source_text.length < 4000);
    assert.ok(!end[0].source_text.includes("<b>"));
    assert.deepEqual(
      (await pg.query("select * from fb_documents order by id")).rows,
      beforeDocs,
    );
    assert.deepEqual(
      (await pg.query("select * from fb_config")).rows,
      beforeConfig,
    );
    assert.deepEqual(
      (await pg.query("select fb_search('quorum','all',30) as results")).rows,
      beforeSearch,
    );
    const identity = result.map(
      ({ content_id, passage_id, published_revision }) => ({
        content_id,
        passage_id,
        published_revision,
      }),
    );
    const current = async (sources: unknown) =>
      (
        await pg.query<{ current: boolean }>(
          "select fb_ai_sources_current($1) as current",
          [sources],
        )
      ).rows[0].current;
    assert.equal(await current(identity), true);
    assert.equal(await current([]), true);
    assert.equal(await current(null), false);
    assert.equal(await current({}), false);
    assert.equal(await current([{}]), false);
    assert.equal(await current(Array(13).fill(identity[0])), false);
    await pg.query("update fb_documents set published_revision=8 where id=$1", [
      ids[0],
    ]);
    assert.equal(await current(identity), false);
    const newIdentity = (await search(["quorum"])).map(
      ({ content_id, passage_id, published_revision }) => ({
        content_id,
        passage_id,
        published_revision,
      }),
    );
    assert.equal(await current(newIdentity), true);
    await pg.query("update fb_documents set published=null where id=$1", [
      ids[0],
    ]);
    assert.equal(await current(newIdentity), false);
    for (const role of ["anon", "authenticated"]) {
      await pg.exec("set role " + role);
      await assert.rejects(search(["quorum"]), /permission denied/);
      await assert.rejects(current([]), /permission denied/);
      await pg.exec("reset role");
    }
    await pg.exec("set role service_role");
    assert.ok((await search(["quorum"])).length);
    assert.equal(await current([]), true);
    await pg.exec("reset role");
  } finally {
    await pg.close();
  }
});
