import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { demoSearch, makeResult, sourcePassages } from "../lib/search";
const migration = new URL(
  "../supabase/history/initial-development/20260921205449_published_search.sql",
  import.meta.url,
);
export const queries = [
  ["Disaster recovery", "Disaster recovery"],
  ["wal archive", "Disaster recovery"],
  ["quorum election", "Distributed systems"],
  ["disast recov", "Disaster recovery"],
  ["disater recovery", "Disaster recovery"],
  ["recovrey", "Disaster recovery"],
  ["zzqxvnothing", ""],
] as const;
test("indexed published retrieval: benchmark, publication lifecycle, source identity and grants", async () => {
  const pg = new PGlite({ extensions: { pg_trgm } });
  try {
    await pg.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    );
    for (const name of [
      "202609190001_fieldbook.sql",
      "202609190002_mcp_audience.sql",
      "202609200001_governance.sql",
      "202609200002_assignments.sql",
      "202609200003_required_learning.sql",
      "202609200004_learning_groups.sql",
    ]) {
      await pg.exec(
        await readFile(
          new URL("../supabase/history/initial-development/" + name, import.meta.url),
          "utf8",
        ),
      );
    }
    await pg.exec(` insert into fb_documents(id,draft,published,published_revision) values('00000000-0000-4000-8000-000000000001','{"title":"draftsecret"}',
 '{"kind":"doc","title":"Disaster recovery","summary":"Restore a service safely","body":"Use a wal archive to restore your database.","updatedAt":"2020-01-01T00:00:00Z","questions":[{"answer":"answersecret"}]}',4);`);
    const beforeBackfill = (await pg.query("select * from fb_documents")).rows;
    await pg.exec(await readFile(migration, "utf8"));
    assert.deepEqual(
      (await pg.query("select * from fb_documents")).rows,
      beforeBackfill,
    );
    await pg.exec(`insert into fb_documents(id,draft,published,published_revision) values('00000000-0000-4000-8000-000000000002','{}',
 '{"kind":"course","title":"Distributed systems","lessons":[{"id":"consensus","title":"Consensus","body":"A quorum election selects the leader."}]}',7);
 insert into fb_documents(id,draft,published,published_revision) values('00000000-0000-4000-8000-000000000003','{}',
 '{"kind":"brief","title":"Weekly news","body":"Disaster recovery was discussed.","updatedAt":"2026-09-21T00:00:00Z"}',2);`);
    const search = async (q: string, kind = "all") =>
      (await pg.query<any>("select fb_search($1,$2) as results", [q, kind]))
        .rows[0].results;
    for (const [q, title] of queries) {
      const rows = await search(q);
      assert.equal(rows[0]?.title || "", title, q);
    }
    assert.equal((await search("quorum election"))[0].lesson_id, "consensus");
    assert.equal((await search("quorum election"))[0].published_revision, 7);
    assert.equal((await search("quorum election"))[0].content_date, null);
    for (const q of ["draftsecret", "answersecret"])
      assert.equal((await search(q)).length, 0);
    assert.equal((await search("quorum", "doc")).length, 0);
    assert.equal((await search("quorum missingword")).length, 0);
    await pg.exec(
      "update fb_documents set updated_at=now(),revision=revision+1 where id='00000000-0000-4000-8000-000000000001'",
    );
    assert.equal(
      (await search("Disaster recovery"))[0].content_date,
      "2020-01-01T00:00:00Z",
    );
    await pg.exec(
      `update fb_documents set draft='{"title":"newdraftsecret"}' where id='00000000-0000-4000-8000-000000000001'`,
    );
    assert.equal((await search("Disaster recovery"))[0].published_revision, 4);
    await pg.exec(`set role anon`);
    await assert.rejects(search("recovery"), /permission denied/);
    await assert.rejects(
      pg.query("select * from fb_search_passages"),
      /permission denied/,
    );
    await assert.rejects(
      pg.query("select * from fb_search_words"),
      /permission denied/,
    );
    await pg.exec("reset role; set role authenticated");
    await assert.rejects(search("recovery"), /permission denied/);
    await pg.exec("reset role; set role service_role");
    assert.equal((await search("quorum"))[0].lesson_id, "consensus");
    await pg.exec("reset role");
    await pg.exec(`insert into fb_documents(id,draft,published,published_revision) values
    (md5('old-update')::uuid,'{}','{"kind":"brief","title":"Matching update","body":"Identical body","updatedAt":"2020-01-01T00:00:00Z"}',1),
    (md5('new-update')::uuid,'{}','{"kind":"brief","title":"Matching update","body":"Identical body","updatedAt":"2026-01-01T00:00:00Z"}',1),
    (md5('created-only')::uuid,'{}','{"kind":"doc","title":"Legacy reference","body":"Historical","createdAt":"2019-01-01T00:00:00Z"}',1)`);
    assert.equal(
      (await search("Matching update"))[0].content_date,
      "2026-01-01T00:00:00Z",
    );
    assert.equal(
      (await search("Legacy reference"))[0].content_date,
      "2019-01-01T00:00:00Z",
    );
    await pg.exec(
      "delete from fb_documents where id in (md5('old-update')::uuid,md5('new-update')::uuid,md5('created-only')::uuid)",
    );
    // 10,000 heterogeneous documents, 10,000 lessons, ~30 MB source text.
    const started = performance.now();
    await pg.exec(
      await readFile(new URL("./search/library.sql", import.meta.url), "utf8"),
    );
    const seedMs = performance.now() - started;

    const times: number[] = [];
    const databaseTimes: number[] = [];
    for (let round = 0; round < 4; round++)
      for (const q of [
        ...queries.map((x) => x[0]),
        "configuration",
        "platform",
        "network latency",
        "credentails",
        "re",
        "a",
        "service operations",
      ]) {
        const t = performance.now();
        await search(q);
        times.push(performance.now() - t);
        const plan = await pg.query<any>(
          "explain (analyze,format json) select fb_search($1,$2)",
          [q, "all"],
        );
        databaseTimes.push(plan.rows[0]["QUERY PLAN"][0]["Execution Time"]);
      }
    times.sort((a, b) => a - b);
    databaseTimes.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        documents: 10003,
        passages: (
          await pg.query<any>("select count(*) from fb_search_passages")
        ).rows[0].count,
        seedMs,
        databaseP95Ms: databaseTimes[Math.floor(databaseTimes.length * 0.95)],
        roundTripsP50Ms: times[Math.floor(times.length * 0.5)],
        roundTripsP95Ms: times[Math.floor(times.length * 0.95)],
      }),
    );
    assert.ok(
      (await search("credentails")).every((r: any) =>
        r.source_text.includes("credentials"),
      ),
    );
    assert.equal((await search("service operations")).length, 31);
    const indexPlan = await pg.query<any>(
      "explain (format json) select content_id from fb_search_passages where search_vector @@ to_tsquery('simple','quorum')",
    );
    assert.match(JSON.stringify(indexPlan.rows), /fb_search_vector_idx/);
    for (const [q, title] of queries)
      assert.equal((await search(q))[0]?.title || "", title, q);
    console.log(
      "QUERY_PLAN",
      JSON.stringify(
        (
          await pg.query(
            "explain (analyze,buffers,format json) select * from fb_search('disater recovery','all')",
          )
        ).rows,
      ),
    );
    await pg.exec(
      `update fb_documents set published=jsonb_set(published,'{body}','"Replacement passage"'),published_revision=5 where id='00000000-0000-4000-8000-000000000001'`,
    );
    assert.equal((await search("wal archive")).length, 0);
    assert.equal(
      (await search("Replacement passage"))[0].published_revision,
      5,
    );
    await pg.exec(
      `update fb_documents set published=null,published_revision=null where id='00000000-0000-4000-8000-000000000002'`,
    );
    assert.equal((await search("quorum")).length, 0);
    await pg.exec(
      `delete from fb_documents where id='00000000-0000-4000-8000-000000000001'`,
    );
    assert.equal((await search("Replacement passage")).length, 0);
  } finally {
    await pg.close();
  }
});
test("safe excerpts and lesson links from synthetic published sources", () => {
  const c: any = {
    id: "one",
    kind: "course",
    status: "published",
    title: "Distributed systems",
    summary: "",
    body: "",
    updatedAt: "",
    publishedRevision: 7,
    lessons: [
      {
        id: "a/b",
        title: "Consensus",
        body: "A quorum election selects the leader.",
      },
    ],
    questions: [{ answer: "private" }],
  };
  const r = demoSearch([c], "quorum", "all").results[0];
  assert.equal(r.href, "/courses/one?lesson=a%2Fb");
  assert.ok(r.highlights.includes("quorum"));
  assert.equal(r.contentDate, null);
  assert.equal(sourcePassages({ ...c, status: "draft" }).length, 0);
  assert.ok(!JSON.stringify(r).includes("private"));
  assert.equal(makeResult(sourcePassages(c)[1], "quorum").publishedRevision, 7);
});
