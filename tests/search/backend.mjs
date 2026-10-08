import { database } from "../helpers/database.mjs";
// Local protocol fixture with the actual current PostgreSQL application schema.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const pg = await database();
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
const searchExamples = [
  ["Course assignments", "Assign courses to learning audiences."],
  ["People", "Manage account records."],
  ["Progress and reporting", "Review reports and learner progress."],
  ["Search", "Use the content type filter to narrow a search."],
  ["Images and video", "Upload a video file through the editor."],
  [
    "AI clients",
    "Search filters and reports explain limitations. Discuss upload video limitations.",
  ],
].map(([title, body], n) => ({
  ...content,
  kind: "doc",
  id: `00000000-0000-4000-8000-${String(100 + n).padStart(12, "0")}`,
  title,
  body,
  summary: body,
  lessons: [],
}));
let access = "public",
  fail = false;
const send = (res, data, status = 200, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(data));
};
async function reset() {
  await pg.query("delete from fb_documents where id=any($1::uuid[])", [
    searchExamples.map((item) => item.id),
  ]);
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
      if (body.searchExamples)
        for (const item of searchExamples)
          await pg.query(
            "insert into fb_documents(id,draft,published,published_revision) values($1,$2,$2,1)",
            [item.id, item],
          );
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
      const requested = url.searchParams.get("id")?.replace(/^eq\./, "") || id;
      const rows = (
        await pg.query(
          "select * from fb_documents where published is not null and id=$1",
          [requested],
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
