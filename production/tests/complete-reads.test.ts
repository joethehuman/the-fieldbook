import { feedbackRows, feedbackCsv } from "../../lib/reporting";
import { serializeCsv } from "../../lib/csv";
import test from "node:test";
import assert from "node:assert/strict";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { PGlite } from "@electric-sql/pglite";
import { snapshot } from "../lib/snapshot";
import { signedMediaUrl } from "../lib/media";
import { contentReport } from "../lib/reports";
import { createMcp } from "../lib/mcp";
import { readAll } from "../lib/read-all";
import { defaultSettings } from "../../lib/settings";
import { seedContent } from "../../lib/seed";
import type { User } from "../../lib/types";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin: User = {
  id: id(1),
  name: "Admin",
  email: "admin@example.test",
  role: "admin",
  groups: [],
  active: true,
};
const learner: User = { ...admin, id: id(2), name: "Learner", role: "learner" };
const manager: User = { ...admin, id: id(3), name: "Manager", role: "manager" };
const peer: User = { ...learner, id: id(4), name: "Other team" };
const course = {
  ...seedContent.find((c) => c.kind === "course")!,
  id: id(9999),
  version: 2,
  status: "published" as const,
};
const file = `${id(8000)}.png`,
  reference = `/api/media/${file}`;

/** Exercise the real Supabase query builder with a capped synthetic HTTP API.
 * Reject unexpected queries; apply filtering/order before the response cap.
 */
async function fixture(
  run: (f: ReturnType<typeof dataFixture>) => Promise<void>,
) {
  const data = dataFixture();
  const originalFetch = globalThis.fetch,
    oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: admin.email,
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "test.supabase.co");
    data.requests.push(url);
    const reply = (
      body: unknown,
      headers: Record<string, string> = {},
      status = 200,
    ) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
      });
    if (url.pathname.includes("/storage/v1/object/sign/")) {
      data.signs++;
      assert.equal(JSON.parse(String(init?.body)).expiresIn, 300);
      return reply({
        signedURL: "/object/sign/fieldbook-media/synthetic?token=synthetic",
      });
    }
    if (url.pathname.endsWith("/fb_config"))
      return reply({ settings: data.settings, revision: 1, curricula: data.curricula });
    if (url.pathname.endsWith("/rpc/fb_governance_snapshot")) {
      const actor = JSON.parse(String(init?.body)).p_actor;
      const users =
        actor === admin.id
          ? [admin, learner, manager, peer]
          : actor === manager.id
            ? [manager, learner]
            : [learner];
      return reply({
        users,
        progress: data.progress.filter((p) =>
          users.some((u) => u.id === p.user_id),
        ),
        groups: [],
        teams: [],
        pending: [],
        revision: 1,
      });
    }
    const table = url.pathname.split("/").pop()!;
    let rows: any[];
    if (table === "fb_documents") rows = [...data.documents];
    else if (table === "fb_feedback") rows = [...data.feedback];
    else if (table === "fb_progress") rows = [...data.progress];
    else if (table === "fb_media")
      rows = data.ready
        ? [{ id: id(8000), ready: true, path: `uploads/${file}` }]
        : [];
    else throw new Error(`Unexpected table ${table}`);
    const params = url.searchParams;
    for (const column of ["id", "user_id", "ready"]) {
      const filter = params.get(column);
      if (filter) {
        assert.ok(filter.startsWith("eq."));
        rows = rows.filter((r) => String(r[column]) === filter.slice(3));
      }
    }
    if (params.has("published")) {
      assert.equal(params.get("published"), "not.is.null");
      rows = rows.filter((r) => r.published !== null);
    }
    if (params.has("or")) {
      assert.equal(table, "fb_documents");
      assert.equal(params.get("select"), "id");
      assert.equal(params.get("limit"), "1");
      const clauses = params.get("or")!.slice(1, -1).split(",");
      rows = rows.filter((r) =>
        clauses.some((clause) => {
          const match = /^published->>(\w+)\.(like|eq)\.(.*)$/.exec(clause);
          assert.ok(match, clause);
          const value = r.published?.[match[1]];
          const text =
            typeof value === "object" ? JSON.stringify(value) : value;
          return match[2] === "eq"
            ? text === match[3]
            : text?.includes(match[3].slice(1, -1));
        }),
      );
    }
    for (const [column, value] of [["published->cardArt->>source", "source"], ["published->cardArt->>imageUrl", "imageUrl"]] as const) {
      const filter = params.get(column);
      if (filter) rows = rows.filter((row) => row.published?.cardArt?.[value] === filter.slice(3));
    }
    const order = params.get("order");
    if (order) {
      const columns = order.split(",").map((s) => s.split("."));
      rows.sort((a, b) => {
        for (const [key, direction] of columns) {
          const cmp = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
          if (cmp) return direction === "desc" ? -cmp : cmp;
        }
        return 0;
      });
    }
    const total = rows.length;
    const offset = Number(params.get("offset") || 0);
    if (data.failTable === table && offset > 0)
      return reply(
        { message: "synthetic late-page failure", code: "XX000" },
        {},
        400,
      );
    rows = rows.slice(
      offset,
      offset + Math.min(Number(params.get("limit") || data.cap), data.cap),
    );
    const select = params.get("select");
    if (select && select !== "*")
      rows = rows.map((r) =>
        Object.fromEntries(select.split(",").map((k) => [k, r[k]])),
      );
    const single = new Headers(init?.headers)
      .get("accept")
      ?.includes("vnd.pgrst.object");
    return reply(single ? (rows[0] ?? null) : rows, {
      "Content-Range": `${offset}-${offset + rows.length - 1}/${total}`,
    });
  };
  try {
    await run(data);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = oldEnv;
  }
}
function dataFixture() {
  const documents = Array.from({ length: 1205 }, (_, i) => {
    const published = {
      ...course,
      id: id(10000 + i),
      title: `Published ${i}`,
      kind: "doc",
      body: "Public body",
    };
    return {
      id: published.id,
      published,
      draft: { ...published, title: "SECRET DRAFT" },
      revision: 2,
      published_revision: 1,
      updated_at: "2026-09-01T00:00:00Z",
    };
  });
  documents.push({
    id: course.id,
    published: course,
    draft: { ...course, title: "SECRET DRAFT" },
    revision: 2,
    published_revision: 1,
    updated_at: "2026-09-01T00:00:00Z",
  });
  for (let i = 0; i < 1100; i++)
    documents.push({
      id: id(20000 + i),
      published: null as any,
      draft: { ...course, title: "SECRET DRAFT" },
      revision: 1,
      published_revision: 0,
      updated_at: "2026-09-21T00:00:00Z",
    });
  const progress = Array.from({ length: 1206 }, (_, i) => ({
    user_id: id(30000 + i),
    content_id: course.id,
    version: course.version,
    lessons: i % 3 === 0 ? course.lessons.map((l) => l.id) : [],
    passed: i % 3 === 0,
    attempts: i % 3 === 1 ? [{ at: "2026-09-01", passed: false }] : [],
  }));
  progress.push({
    user_id: learner.id,
    content_id: course.id,
    version: 1,
    lessons: course.lessons.map((l) => l.id),
    passed: true,
    attempts: [],
  });
  progress.push({
    user_id: peer.id,
    content_id: course.id,
    version: 2,
    lessons: ["removed-lesson"],
    passed: false,
    attempts: [],
  });
  const feedback = Array.from({ length: 1205 }, (_, i) => ({
    id: id(40000 + i),
    user_id: learner.id,
    content_id: id(10000 + i),
    version: 1,
    rating: i % 2 ? "down" : "up",
    comment: "Synthetic",
    updated_at: "2026-09-01",
  }));
  feedback.push({
    ...feedback[0],
    id: id(50000),
    user_id: peer.id,
    content_id: course.id,
  });
  return {
    documents,
    progress,
    feedback,
    settings: { ...defaultSettings },
    curricula: [] as { status: string; cardArt?: { source: string; imageUrl: string } }[],
    cap: 137,
    ready: true,
    signs: 0,
    requests: [] as URL[],
    failTable: "",
  };
}

test("complete snapshots preserve older published items and scope drafts, answers, feedback and people", async () =>
  fixture(async (f) => {
    for (const user of [null, learner, manager, admin]) {
      const workspace = await snapshot(user);
      assert.equal(workspace.publishedContent!.length, 1206);
      assert.equal(
        new Set(workspace.publishedContent!.map((d) => d.id)).size,
        1206,
      );
      assert.equal(workspace.content.length, user === admin ? 2306 : 1206);
      assert.equal(
        workspace.feedback!.length,
        user === admin ? 1206 : user === learner ? 1205 : 0,
      );
      if (user !== admin) {
        assert.ok(!JSON.stringify(workspace.content).includes("SECRET DRAFT"));
        assert.ok(
          workspace.content.every((c) =>
            c.questions.every((q) => q.answer === undefined),
          ),
        );
        assert.ok(!workspace.users.some((u) => u.id === peer.id));
        assert.ok(!workspace.progress[peer.id]);
        assert.ok(workspace.feedback!.every((r) => r.userId === user?.id));
      }
      if (user === admin) {
        const exportRows = feedbackCsv(feedbackRows(workspace));
        assert.equal(exportRows.rows.length, 1206);
        assert.ok(serializeCsv(exportRows).includes("Synthetic"));
      }
      const same = await snapshot(user);
      assert.deepEqual(
        same.content.map((d) => d.id),
        workspace.content.map((d) => d.id),
      );
    }
    assert.ok(
      f.requests
        .filter((u) => u.pathname.endsWith("fb_documents"))
        .every((u) => u.searchParams.get("order") === "id.asc"),
    );
    f.settings.access = "private";
    await assert.rejects(snapshot(null), /Sign in/);
  }));

test("MCP tool returns complete totals and learner activity semantics beyond the cap", async () =>
  fixture(async () => {
    const server = createMcp(admin, "synthetic");
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(
        new Request("https://example.test/api/mcp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "content_report", arguments: {} },
          }),
        }),
      );
      const envelope = await response.json();
      assert.ok(!envelope.result.isError, JSON.stringify(envelope));
      const report = JSON.parse(envelope.result.content[0].text);
      assert.deepEqual(report.courses, [
        {
          id: course.id,
          title: course.title,
          version: 2,
          started: 804,
          completed: 402,
        },
      ]);
      assert.equal(report.feedback.length, 2306);
      assert.equal(
        report.feedback.reduce(
          (sum: number, r: any) => sum + r.positive + r.negative,
          0,
        ),
        1206,
      );
      assert.equal(report.complete, true);
      assert.equal(report.recordLimit, undefined);
      assert.ok(!JSON.stringify(report).includes("user_id"));
      for (const user of [null, learner, manager])
        await assert.rejects(contentReport(user));
    } finally {
      await server.close();
    }
  }));

test("published media lookup covers old articles, lessons, videos and covers without scanning the catalog", async () =>
  fixture(async (f) => {
    const old = f.documents[1204];
    for (const fragment of [
      { body: `![Image](${reference})` },
      { lessons: [{ body: `![Image](${reference})` }] },
      { lessons: [{ videoUrl: reference }] },
      { coverImageUrl: reference },
      { cardArt: { source: "upload", shortTitle: "Cover", version: 1, seed: 3, imageUrl: reference } },
    ]) {
      old.published = { ...course, ...fragment } as any;
      assert.match(
        await signedMediaUrl(file, null),
        /\/storage\/v1\/object\/sign\//,
      );
    }
    old.published = null as any;
    old.draft.body = reference;
    await assert.rejects(signedMediaUrl(file, learner), /Media not found/);
    assert.equal(f.signs, 5);
    await signedMediaUrl(file, admin);
    await assert.rejects(signedMediaUrl(file, null), /Media not found/);
    f.curricula.push({ status: "published", cardArt: { source: "upload", imageUrl: reference } });
    await signedMediaUrl(file, learner);
    f.curricula[0].status = "draft";
    await assert.rejects(signedMediaUrl(file, learner), /Media not found/);
    f.settings.access = "private";
    await assert.rejects(signedMediaUrl(file, null), /Sign in/);
    await assert.rejects(signedMediaUrl(file, learner), /Media not found/);
    f.ready = false;
    await assert.rejects(signedMediaUrl(file, admin), /Media not found/);
    await assert.rejects(
      signedMediaUrl("invalid.png", admin),
      /Media not found/,
    );
    assert.equal(f.signs, 7);
    assert.ok(
      f.requests
        .filter((u) => u.pathname.endsWith("fb_documents"))
        .every(
          (u) =>
            (u.searchParams.has("or") || u.searchParams.has("published->cardArt->>source")) && u.searchParams.get("select") === "id",
        ),
    );
  }));

test("later page errors never produce a partial workspace or report", async () =>
  fixture(async (f) => {
    for (const table of ["fb_documents", "fb_feedback"]) {
      f.failTable = table;
      await assert.rejects(snapshot(admin), /database operation failed/);
      await assert.rejects(contentReport(admin), /database operation failed/);
    }
    f.failTable = "fb_progress";
    await assert.rejects(contentReport(admin), /database operation failed/);
  }));

test("pagination handles empty and exact pages, lower caps, missing counts and changing totals", async () => {
  for (const length of [0, 500, 1000, 1001]) {
    const data = Array.from({ length }, (_, i) => i);
    for (const cap of [1, 137, 500, 1000]) {
      assert.deepEqual(
        await readAll(async (from, to) => ({
          data: data.slice(from, Math.min(to + 1, from + cap)),
          error: null,
          count: length,
        })),
        data,
      );
    }
  }
  for (const response of [
    { data: [], count: 1 },
    { data: [], count: null },
    { data: null, count: 0 },
  ])
    await assert.rejects(
      readAll(async () => ({ ...response, error: null })),
      /read completely/,
    );
  let calls = 0;
  await assert.rejects(
    readAll(async () => ({
      data: [1],
      error: null,
      count: ++calls === 1 ? 2 : 3,
    })),
    /read completely/,
  );
});

test("Postgres JSON text filters match nested published media while excluding draft-only references", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      "create table documents (id int, published jsonb, draft jsonb)",
    );
    await pg.query(
      "insert into documents select i, jsonb_build_object('body', 'unrelated'), '{}'::jsonb from generate_series(1,1200) i",
    );
    for (const [i, published] of [
      { body: reference },
      { lessons: [{ body: reference }] },
      { lessons: [{ videoUrl: reference }] },
      { coverImageUrl: reference },
    ].entries())
      await pg.query("insert into documents values ($1, $2, '{}')", [
        1201 + i,
        JSON.stringify(published),
      ]);
    await pg.query("insert into documents values (1300, null, $1)", [
      JSON.stringify({ body: reference }),
    ]);
    const result = await pg.query<{ id: number }>(
      "select id from documents where published is not null and (published->>'body' like $1 or published->>'summary' like $1 or published->>'lessons' like $1 or published->>'coverImageUrl' = $2) order by id",
      [`%${reference}%`, reference],
    );
    assert.deepEqual(
      result.rows.map((r) => r.id),
      [1201, 1202, 1203, 1204],
    );
  } finally {
    await pg.close();
  }
});
