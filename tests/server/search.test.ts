import test from "node:test";
import assert from "node:assert/strict";
import { searchPublished, retrievePublished } from "../../server/search";
test("retrieval checks access before querying and exposes only published source metadata", async () => {
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
  });
  let access = "private",
    calls = 0,
    fail = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    let value: unknown;
    if (url.pathname.endsWith("/fb_config")) value = { settings: { access } };
    else if (url.pathname.endsWith("/rpc/fb_search")) {
      calls++;
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_query: "quorum",
        p_kind: "course",
        p_limit: 31,
      });
      if (fail)
        return new Response(
          JSON.stringify({ message: "internal failure", code: "XX000" }),
          { status: 500 },
        );
      value = [
        {
          content_id: "one",
          passage_id: "lesson:a",
          kind: "course",
          title: "Systems",
          lesson_id: "a",
          lesson_title: "Consensus",
          source_text: "A quorum elects a leader",
          published_revision: 4,
          content_date: "invalid",
        },
      ];
    } else throw Error("Unexpected request " + url.pathname);
    return new Response(JSON.stringify(value), {
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await assert.rejects(searchPublished("quorum", "course", null), {
      status: 401,
    });
    assert.equal(calls, 0);
    const user: any = { id: "one", active: true, role: "learner", groups: [] };
    await assert.rejects(
      searchPublished("quorum", "course", { ...user, active: false }),
      { status: 403 },
    );
    assert.equal(calls, 0);
    for (const role of ["learner", "manager", "admin"]) {
      const result = await searchPublished("quorum", "course", {
        ...user,
        role,
      });
      assert.equal(result.results[0].href, "/courses/systems--one?lesson=a");
      assert.equal(result.results[0].contentDate, null);
      assert.equal(result.results[0].publishedRevision, 4);
      assert.ok(!("text" in result.results[0]));
    }
    access = "public";
    assert.equal(
      (await retrievePublished("quorum", "course", null))[0].text,
      "A quorum elects a leader",
    );
    await assert.rejects(searchPublished("x".repeat(161), "all", null), {
      status: 400,
    });
    await assert.rejects(searchPublished("query", "draft" as any, null), {
      status: 400,
    });
    fail = true;
    await assert.rejects(
      searchPublished("quorum", "course", null),
      /database operation failed/,
    );
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
});
