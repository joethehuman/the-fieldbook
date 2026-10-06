// Local protocol fixture + real embedded PostgreSQL search. No hosted service.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
const pg = new PGlite({ extensions: { pg_trgm } });
await pg.exec(`create role anon;create role authenticated;create role service_role;
create table fb_documents(id uuid primary key, draft jsonb,published jsonb,published_revision integer,revision integer default 1,updated_at text default '2026-01-01');`);
await pg.exec(
  await readFile(
    "supabase/history/initial-development/20260921205449_published_search.sql",
    "utf8",
  ),
);
const id = "00000000-0000-4000-8000-000000000001";
const content = {
  id,
  kind: "course",
  title: "Distributed systems",
  summary: "Practical service operations",
  body: "",
  category: "Engineering",
  folder: "",
  status: "published",
  version: 1,
  updatedAt: "2026-01-01",
  duration: 5,
  groups: [],
  lessons: [
    { id: "intro", title: "Introduction", body: "Reliable services." },
    {
      id: "consensus",
      title: "Consensus",
      body: "A quorum election chooses a leader.",
    },
  ],
  questions: [],
};
let access = "public",
  fail = false;
const send = (res, data, status = 200, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(data));
};
async function reset() {
  await pg.query("delete from fb_documents where id=$1", [id]);
  await pg.query(
    "insert into fb_documents(id,draft,published,published_revision) values($1,$2,$2,4)",
    [id, content],
  );
  access = "public";
  fail = false;
}
await reset();
await pg.exec(await readFile("tests/search/library.sql", "utf8"));
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || "{}");
    if (url.pathname === "/health") return send(res, {});
    if (url.pathname === "/fixture") {
      if (body.reset) await reset();
      if (body.access) access = body.access;
      fail = !!body.fail;
      if (body.unpublish)
        await pg.query(
          "update fb_documents set published=null,published_revision=null where id=$1",
          [id],
        );
      return send(res, {});
    }
    if (url.pathname === "/rest/v1/fb_config")
      return send(res, {
        settings: {
          name: "Search fixture",
          access,
          registration: "closed",
          logoUrl: "",
          tagline: "",
          accent: "#0069ff",
        },
        revision: 1,
        curricula: [],
      });
    if (url.pathname === "/rest/v1/fb_documents") {
      const rows = (
        await pg.query(
          "select * from fb_documents where published is not null and id='00000000-0000-4000-8000-000000000001'",
        )
      ).rows;
      return send(res, rows, 200, {
        "Content-Range": `0-${rows.length - 1}/${rows.length}`,
      });
    }
    if (url.pathname === "/rest/v1/rpc/fb_search") {
      if (fail) return send(res, { message: "Synthetic failure" }, 500);
      const start = performance.now();
      const result = (
        await pg.query("select fb_search($1,$2,$3) as results", [
          body.p_query,
          body.p_kind,
          body.p_limit,
        ])
      ).rows[0].results;
      return send(res, result, 200, {
        "Server-Timing": `database;dur=${performance.now() - start}`,
      });
    }
    return send(
      res,
      { message: "Unexpected fixture request " + url.pathname },
      404,
    );
  } catch (e) {
    console.error(e);
    send(res, { message: "fixture failed" }, 500);
  }
}).listen(3130, "127.0.0.1");
