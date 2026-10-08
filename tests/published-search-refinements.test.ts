import assert from "node:assert/strict";
import { test } from "node:test";
import { database, pendingMigrationSql } from "./helpers/database.mjs";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const examples = [
  { kind: "doc", title: "Docs", body: "Maintained reference material." },
  {
    kind: "doc",
    title: "Course assignments",
    body: "Assign courses to learning audiences.",
  },
  { kind: "doc", title: "People", body: "Manage account records." },
  {
    kind: "doc",
    title: "Progress and reporting",
    body: "Review reports and learner progress.",
  },
  {
    kind: "doc",
    title: "Search",
    body: "Use the content type filter to narrow a search.",
  },
  {
    kind: "doc",
    title: "Images and video",
    body: "Upload a video file through the editor.",
  },
  {
    kind: "doc",
    title: "AI clients",
    body: "Search filters and reports explain limitations. Discuss upload video limitations.",
  },
  {
    kind: "doc",
    title: "Connection settings",
    body: "FIELDBOOK_APP_KIND NEXT_PUBLIC_SUPABASE_URL marker003 MCP",
  },
  {
    kind: "course",
    title: "Working with content",
    body: "",
    lessons: [
      {
        id: "formatting",
        title: "Formatting",
        body: "A callout explains a key point.",
      },
    ],
    questions: [{ answer: "answersecret" }],
  },
];

async function seed(pg: Awaited<ReturnType<typeof database>>) {
  for (const [n, content] of examples.entries())
    await pg.query(
      "insert into fb_documents(id,draft,published,published_revision) values($1,$2,$2,3)",
      [id(n + 1), content],
    );
  await pg.query(
    "insert into fb_documents(id,draft,published,published_revision) values($1,'{}',$2,1)",
    [id(90), { kind: "doc", title: "Retired", body: "coruse reproducing" }],
  );
  await pg.query("delete from fb_documents where id=$1", [id(90)]);
  await pg.query("insert into fb_documents(id,draft) values($1,$2)", [
    id(91),
    { kind: "doc", title: "draftsecret" },
  ]);
}

async function search(
  pg: Awaited<ReturnType<typeof database>>,
  query: string,
  kind = "all",
) {
  return (
    await pg.query<{
      results: {
        title: string;
        content_id: string;
        lesson_id: string | null;
        matched_terms: string[];
        published_revision: number;
      }[];
    }>("select fb_search($1,$2,31) as results", [query, kind])
  ).rows[0].results;
}

test("search migration preserves existing content and indexed passages while adding forms and typo correction", async () => {
  const pg = await database({ baselineOnly: true });
  try {
    await seed(pg);
    const snapshot = () =>
      pg.query(
        "select (select jsonb_agg(to_jsonb(d) order by id) from fb_documents d) as documents,(select jsonb_agg(to_jsonb(s) order by content_id,passage_id) from fb_search_passages s) as passages,(select array_agg(word order by word) from fb_search_words) as words",
      );
    const before = (await snapshot()).rows;
    assert.equal((await search(pg, "coruse")).length, 0);
    assert.ok(
      !(await search(pg, "search filters")).some(
        (row) => row.title === "Search",
      ),
    );
    await pg.exec(pendingMigrationSql);
    assert.deepEqual((await snapshot()).rows, before);
    for (const [query, title] of [
      ["coruse", "Course assignments"],
      ["focs", "Docs"],
      ["pepole", "People"],
      ["reproting", "Progress and reporting"],
      ["upolad", "Images and video"],
      ["reports", "Progress and reporting"],
      ["search filters", "Search"],
      ["upload video", "Images and video"],
    ])
      assert.equal((await search(pg, query))[0]?.title, title, query);
    assert.equal(
      (await search(pg, "callout", "course"))[0].lesson_id,
      "formatting",
    );
    assert.equal((await search(pg, "People"))[0].published_revision, 3);
    await pg.query(
      "insert into fb_documents(id,draft,published,published_revision) values($1,'{}',$2,1)",
      [id(92), { kind: "doc", title: "Fresh topics", body: "New vocabulary." }],
    );
    assert.equal((await search(pg, "fresh topic"))[0].title, "Fresh topics");
  } finally {
    await pg.close();
  }
});

test("refined search keeps exact, prefix, technical and Unicode matches and service-only permissions", async () => {
  const pg = await database();
  try {
    await seed(pg);
    for (const content of examples)
      assert.equal((await search(pg, content.title))[0].title, content.title);
    for (const [query, title] of [
      ["course ass", "Course assignments"],
      ["imgaes", "Images and video"],
      ["FIELDBOOK_APP_KIND", "Connection settings"],
      ["marker003", "Connection settings"],
      ["MCPP", "Connection settings"],
    ])
      assert.equal((await search(pg, query))[0]?.title, title, query);
    for (const query of [
      "marker002",
      "answersecret",
      "draftsecret",
      "zzqxvnothing",
      "people missingunfindable",
    ])
      assert.equal((await search(pg, query)).length, 0, query);
    await pg.query(
      "insert into fb_documents(id,draft,published,published_revision) values($1,'{}',$2,1)",
      [
        id(93),
        {
          kind: "doc",
          title: "Équipe 日本語 préparation",
          body: "Unicode terms stay literal.",
        },
      ],
    );
    assert.equal(
      (await search(pg, "prépar équip"))[0].title,
      "Équipe 日本語 préparation",
    );
    assert.equal(
      (await search(pg, "日本"))[0].title,
      "Équipe 日本語 préparation",
    );
    await pg.query(
      "insert into fb_documents(id,draft,published,published_revision) values($1,'{}',$2,1)",
      [
        id(94),
        { kind: "doc", title: "Custom settings", body: "Configuration." },
      ],
    );
    await pg.query(
      "insert into fb_documents(id,draft,published,published_revision) values($1,'{}',$2,1)",
      [
        id(95),
        { kind: "doc", title: "Reference", body: "Customer instructions." },
      ],
    );
    assert.equal((await search(pg, "customer"))[0].title, "Reference");
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      await assert.rejects(search(pg, "reports"), /permission denied/);
      await assert.rejects(
        pg.query("select fb_search_near('coruse','course')"),
        /permission denied/,
      );
      await assert.rejects(
        pg.query("select * from fb_search_words"),
        /permission denied/,
      );
      await pg.exec("reset role");
    }
    await pg.exec("set role service_role");
    assert.equal(
      (await search(pg, "reports"))[0].title,
      "Progress and reporting",
    );
    await pg.exec("reset role");
  } finally {
    await pg.close();
  }
});

test("single-edit correction recognizes adjacent swaps without accepting unrelated words", async () => {
  const pg = await database();
  try {
    for (const [query, word, expected] of [
      ["coruse", "course", true],
      ["pepole", "people", true],
      ["upolad", "upload", true],
      ["reproting", "reporting", true],
      ["leanring", "learning", true],
      ["edtior", "editor", true],
      ["vdieo", "video", true],
      ["imgaes", "images", true],
      ["cotnent", "content", true],
      ["instalation", "installation", true],
      ["coursex", "course", true],
      ["cotnent", "comment", false],
      ["reproting", "repeating", false],
      ["leanring", "leaving", false],
      ["abc", "abd", false],
      ["people", "person", false],
    ] as const)
      assert.equal(
        (
          await pg.query<{ near: boolean }>(
            "select fb_search_near($1,$2) as near",
            [query, word],
          )
        ).rows[0].near,
        expected,
        `${query}: ${word}`,
      );
  } finally {
    await pg.close();
  }
});
