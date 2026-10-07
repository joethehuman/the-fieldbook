import assert from "node:assert/strict";
import { test } from "node:test";
import { feedbackRows } from "../lib/reporting";
import { freshWorkspace } from "../lib/store";
import { database, seedProfile } from "./helpers/database.mjs";

test("feedback reports label guests and general submissions without a content item", () => {
  const workspace = freshWorkspace();
  workspace.feedback = [
    {
      id: crypto.randomUUID(),
      userId: "guest",
      rating: "down",
      comment: "Navigation was confusing",
      updatedAt: "2026-09-26T00:00:00Z",
    },
  ];
  const row = feedbackRows(workspace)[0];
  assert.equal(row.title, "Fieldbook feedback");
  assert.equal(row.kind, "General");
  assert.equal(row.person, "Guest visitor");
  assert.equal(feedbackRows(workspace, "general").length, 1);
  assert.equal(feedbackRows(workspace, "doc").length, 0);
});

test("feedback keeps separate account/guest submissions, enforces authorship and paired content fields, and denies direct browser access", async () => {
  const pg = await database();
  try {
    const user = crypto.randomUUID(),
      content = crypto.randomUUID();
    await seedProfile(pg, user);
    await pg.query(
      "insert into fb_documents(id,draft,published) values($1,$2,$2)",
      [content, { kind: "doc", title: "Document", body: "Useful", version: 1 }],
    );
    const first = crypto.randomUUID(),
      second = crypto.randomUUID();
    await pg.query(
      "insert into fb_feedback(id,user_id,content_id,version,rating,comment) values($1,$3,$4,1,'up','First'),($2,$3,$4,1,'down','Second')",
      [first, second, user, content],
    );
    await pg.query(
      "insert into fb_feedback(id,guest_key,content_id,version,rating,comment) values($1,$3,$4,1,'up','Guest one'),($2,$3,$4,1,'down','Guest two')",
      [crypto.randomUUID(), crypto.randomUUID(), "a".repeat(64), content],
    );
    await pg.query(
      "insert into fb_feedback(id,user_id,rating,comment) values($1,$2,'up','General')",
      [crypto.randomUUID(), user],
    );
    assert.equal((await pg.query("select * from fb_feedback")).rows.length, 5);
    await pg.query(
      "update fb_feedback set comment='Comment on first entry' where id=$1",
      [first],
    );
    assert.equal(
      (
        await pg.query<{ comment: string }>(
          "select comment from fb_feedback where id=$1",
          [second],
        )
      ).rows[0].comment,
      "Second",
    );
    for (const entry of [
      { id: crypto.randomUUID(), rating: "up", comment: "Missing author" },
      {
        id: crypto.randomUUID(),
        user_id: user,
        guest_key: "a".repeat(64),
        rating: "up",
        comment: "Two authors",
      },
      {
        id: crypto.randomUUID(),
        guest_key: "invalid",
        rating: "up",
        comment: "Bad guest key",
      },
      {
        id: crypto.randomUUID(),
        user_id: user,
        content_id: content,
        rating: "up",
        comment: "Missing version",
      },
      {
        id: crypto.randomUUID(),
        user_id: user,
        version: 1,
        rating: "up",
        comment: "Missing content",
      },
    ]) {
      const keys = Object.keys(entry);
      await assert.rejects(
        pg.query(
          `insert into fb_feedback(${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
          Object.values(entry),
        ),
      );
    }
    await pg.query("delete from fb_feedback where id=any($1::uuid[])", [
      [first, second],
    ]);
    assert.equal((await pg.query("select * from fb_feedback")).rows.length, 3);
    for (const role of ["anon", "authenticated"]) {
      await pg.exec("set role " + role);
      await assert.rejects(
        pg.query("select * from fb_feedback"),
        /permission denied/,
      );
      await pg.exec("reset role");
    }
  } finally {
    await pg.close();
  }
});
