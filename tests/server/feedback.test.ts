import test from "node:test";
import assert from "node:assert/strict";
import { deleteFeedback } from "../../server/delete-feedback";
import { supabaseData } from "../../server/providers/supabase/data";
import { feedbackData } from "../../server/providers/supabase/data/feedback";
import { freshWorkspace } from "../../lib/store";

const id = "00000000-0000-4000-8000-000000000101";

test("feedback deletion requires an active administrator and bounded valid targets", async () => {
  const user = freshWorkspace().users.find((u) => u.role === "admin")!;
  const original = supabaseData.deleteFeedback;
  const calls: string[][] = [];
  supabaseData.deleteFeedback = async (ids) => {
    calls.push(ids);
    return ids;
  };
  try {
    for (const actor of [
      null,
      { ...user, role: "contributor" as const },
      { ...user, role: "learner" as const },
      { ...user, active: false },
    ]) {
      await assert.rejects(deleteFeedback(actor, { ids: [id] }));
    }
    for (const ids of [[], ["invalid"], Array(201).fill(id)])
      await assert.rejects(deleteFeedback(user, { ids }));
    assert.equal(calls.length, 0);
    assert.deepEqual(await deleteFeedback(user, { ids: [id, id] }), [id]);
    assert.deepEqual(calls, [[id]]);
  } finally {
    supabaseData.deleteFeedback = original;
  }
});

test("feedback retries are limited to their author and content; legacy uniqueness supports staged deployment", async () => {
  const previous = { ...process.env },
    original = globalThis.fetch;
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
    SUPABASE_SECRET_KEY: "synthetic",
    FIELDBOOK_URL: "http://localhost:3000",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
    VERCEL_ENV: "",
    FIELDBOOK_ENVIRONMENT: "",
  });
  const record = {
    id,
    content_id: "00000000-0000-4000-8000-000000000021",
    version: 1,
    rating: "up" as const,
    comment: "Comment",
    updated_at: "2026-10-07T00:00:00Z",
  };
  let conflict = "fb_feedback_pkey",
    available = true;
  const requests: { url: URL; method: string; body: any }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({
      url,
      method: init?.method || "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (init?.method === "POST")
      return Response.json(
        {
          code: "23505",
          message: `duplicate key violates unique constraint "${conflict}"`,
        },
        { status: 409 },
      );
    return Response.json(available ? [{ id }] : []);
  };
  try {
    assert.equal(
      await feedbackData.saveFeedback(record, { userId: "member" }),
      id,
    );
    const update = requests.at(-1)!;
    assert.equal(update.url.searchParams.get("id"), `eq.${id}`);
    assert.equal(update.url.searchParams.get("user_id"), "eq.member");
    assert.equal(
      update.url.searchParams.get("content_id"),
      `eq.${record.content_id}`,
    );
    assert(!("id" in update.body));
    available = false;
    await assert.rejects(
      feedbackData.saveFeedback(record, { guestKey: "a".repeat(64) }),
      /unavailable/,
    );
    assert.equal(
      requests.at(-1)!.url.searchParams.get("guest_key"),
      `eq.${"a".repeat(64)}`,
    );
    available = true;
    conflict = "fb_feedback_user_id_content_id_key";
    assert.equal(
      await feedbackData.saveFeedback(record, { userId: "member" }),
      id,
    );
    assert.equal(requests.at(-1)!.url.searchParams.has("id"), false);
  } finally {
    globalThis.fetch = original;
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
