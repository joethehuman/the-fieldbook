import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import { withPublishedSnapshots } from "../lib/demo-publication";
import {
  applyDemoBulk,
  expireDemoDeleted,
  retentionMs,
  metadataPatch,
} from "../lib/bulk-actions";
const now = Date.parse("2026-09-27T12:00:00Z");
function fixture() {
  const data = withPublishedSnapshots(freshWorkspace());
  return { data, actor: data.users.find((u) => u.role === "admin")! };
}
test("bulk category preserves an unpublished body and published copy, dates and version", () => {
  const { data, actor } = fixture();
  const c = data.content.find((c) => c.kind === "brief")!;
  const live = data.publishedContent!.find((p) => p.id === c.id)!;
  const publishedBody = live.body;
  c.body = "Unsaved for publication";
  c.status = "draft";
  c.revision = 2;
  const result = applyDemoBulk(
    data,
    actor,
    {
      entity: "content",
      operation: "category",
      items: [{ id: c.id, expected: 2 }],
      value: data.content.find(
        (p) => p.kind === "brief" && p.category !== c.category,
      )!.category,
    },
    now,
  );
  assert.equal(result.results[0].status, "changed");
  assert.equal(result.data.content.find((i) => i.id === c.id)!.body, c.body);
  assert.equal(
    result.data.publishedContent!.find((i) => i.id === c.id)!.body,
    publishedBody,
  );
  assert.equal(
    result.data.content.find((i) => i.id === c.id)!.updatedAt,
    c.updatedAt,
  );
  assert.equal(
    result.data.content.find((i) => i.id === c.id)!.version,
    c.version,
  );
});
test("deletion is immediately hidden, repeat requests retain deadline, restore is draft", () => {
  const { data, actor } = fixture();
  const c = data.content[0];
  const request = {
    entity: "content" as const,
    operation: "delete" as const,
    items: [{ id: c.id, expected: c.revision! }],
  };
  const first = applyDemoBulk(data, actor, request, now);
  assert(!first.data.content.some((i) => i.id === c.id));
  assert(!first.data.publishedContent!.some((i) => i.id === c.id));
  const again = applyDemoBulk(first.data, actor, request, now + 1000);
  assert.equal(again.results[0].status, "unchanged");
  assert.equal(
    again.data.deletedItems![0].purgeAfter,
    new Date(now + retentionMs).toISOString(),
  );
  const restored = applyDemoBulk(
    again.data,
    actor,
    {
      entity: "content",
      operation: "restore",
      items: [{ id: c.id, expected: first.data.deletedItems![0].revision }],
    },
    now + retentionMs - 1,
  );
  assert.equal(
    restored.data.content.find((i) => i.id === c.id)!.status,
    "draft",
  );
  assert.equal(restored.data.deletedItems!.length, 0);
});
test("expiry erases course progress and feedback exactly at the deadline", () => {
  const { data, actor } = fixture();
  const c = data.content.find((c) => c.kind === "course")!;
  data.feedback = [
    {
      id: "rating",
      userId: "demo-learner",
      contentId: c.id,
      version: 1,
      rating: "up",
      comment: "fixture",
      updatedAt: new Date(now).toISOString(),
    },
  ];
  data.progress["demo-learner"] = [
    { content_id: c.id, version: 1, lessons: [], passed: true },
  ];
  const deleted = applyDemoBulk(
    data,
    actor,
    {
      entity: "content",
      operation: "delete",
      items: [{ id: c.id, expected: c.revision! }],
    },
    now,
  ).data;
  assert.equal(
    expireDemoDeleted(deleted, now + retentionMs - 1).deletedItems!.length,
    1,
  );
  const expired = expireDemoDeleted(deleted, now + retentionMs);
  assert.equal(expired.deletedItems!.length, 0);
  assert.equal(expired.progress["demo-learner"].length, 0);
  assert.equal(expired.feedback!.length, 0);
  const restore = applyDemoBulk(
    deleted,
    actor,
    {
      entity: "content",
      operation: "restore",
      items: [{ id: c.id, expected: 2 }],
    },
    now + retentionMs,
  );
  assert.equal(restore.results[0].status, "failed");
});
test("users restore inactive without privileges; self deletion is protected and deleted managers leave teams unassigned", () => {
  const { data, actor } = fixture();
  const u = data.users.find((u) => u.role === "learner")!;
  const manager = data.users.find((u) => u.role === "manager")!;
  const result = applyDemoBulk(
    data,
    actor,
    {
      entity: "user",
      operation: "delete",
      items: [actor, manager, u].map((u) => ({ id: u.id, expected: 0 })),
    },
    now,
  );
  assert.deepEqual(
    result.results.map((r) => r.status),
    ["failed", "changed", "changed"],
  );
  assert.deepEqual(
    result.data.teams,
    data.teams?.map((team) => {
      if (team.managerId !== manager.id) return team;
      const { managerId: _manager, ...unassigned } = team;
      return unassigned;
    }),
  );
  const restore = applyDemoBulk(
    result.data,
    actor,
    {
      entity: "user",
      operation: "restore",
      items: [{ id: u.id, expected: 1 }],
    },
    now + 1,
  );
  const restored = restore.data.users.find((p) => p.id === u.id)!;
  assert.equal(restored.active, false);
  assert.equal(restored.role, "learner");
  assert.deepEqual(restored.groups, []);
  assert.equal(restored.teamId, undefined);
});
test("top-level and nested section destinations derive the Docs category", () => {
  const { data } = fixture();
  const doc = data.content.find((c) => c.kind === "doc")!;
  data.settings = {
    name: "Test",
    accent: "#0069ff",
    access: "private",
    registration: "closed",
    docSections: [
      { id: "top", name: "Top" },
      { id: "sub", name: "Nested", parentId: "top" },
    ],
  };
  assert.deepEqual(metadataPatch(data, doc, "section", "top"), {
    category: "Top",
    folder: "",
    sectionId: "top",
  });
  assert.deepEqual(metadataPatch(data, doc, "section", "sub"), {
    category: "Top",
    folder: "Nested",
    sectionId: "sub",
  });
  assert.throws(() => metadataPatch(data, doc, "category", "New"), /section/);
});
test("a stale item fails independently and leaves its saved content untouched", () => {
  const { data, actor } = fixture();
  const [first, second] = data.content;
  const result = applyDemoBulk(
    data,
    actor,
    {
      entity: "content",
      operation: "delete",
      items: [
        { id: first.id, expected: 99 },
        { id: second.id, expected: second.revision! },
      ],
    },
    now,
  );
  assert.deepEqual(
    result.results.map((r) => r.status),
    ["failed", "changed"],
  );
  assert.deepEqual(
    result.data.content.find((c) => c.id === first.id),
    first,
  );
});

test("bulk category rejects free text and mixed content types", () => {
  const { data, actor } = fixture();
  const update = data.content.find((c) => c.kind === "brief")!;
  const course = data.content.find((c) => c.kind === "course")!;
  assert.throws(
    () => metadataPatch(data, update, "category", "Unconfigured category"),
    /existing/,
  );
  assert.throws(
    () =>
      applyDemoBulk(
        data,
        actor,
        {
          entity: "content",
          operation: "category",
          value: update.category,
          items: [update, course].map((c) => ({
            id: c.id,
            expected: c.revision!,
          })),
        },
        now,
      ),
    /type/,
  );
});
