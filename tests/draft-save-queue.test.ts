import test from "node:test";
import assert from "node:assert/strict";
import { createDraftSaveQueue, type SaveIntent } from "../lib/draft-save-queue";
import { contentSignature, hasUnpublishedEdits } from "../lib/demo-publication";
import { seedContent } from "../lib/seed";
import type { Content } from "../lib/types";

const initial = {
  ...seedContent.find((c) => c.kind === "course")!,
  revision: 7,
  publishedRevision: 7,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test("queue skips initial writes, coalesces slow saves, preserves latest typing and serializes publication", async () => {
  let current: Content = structuredClone(initial);
  const writes: {
    snapshot: Content;
    intent: SaveIntent;
    done: ReturnType<typeof deferred<Content>>;
  }[] = [];
  const queue = createDraftSaveQueue({
    initial: current,
    read: () => current,
    save: async (snapshot, intent) => {
      const done = deferred<Content>();
      writes.push({ snapshot, intent, done });
      return done.promise;
    },
    acknowledge: (saved, snapshot) => {
      current =
        contentSignature(current) === contentSignature(snapshot)
          ? saved
          : { ...current, revision: saved.revision };
    },
    failed: () => assert.fail("Unexpected failure"),
  });
  await queue.flush();
  assert.equal(writes.length, 0);
  current = { ...current, title: "First" };
  const saving = queue.flush();
  current = { ...current, title: "Second" };
  current = { ...current, title: "Latest" };
  const publishing = queue.flush("published");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].intent, "draft");
  writes[0].done.resolve({ ...writes[0].snapshot, revision: 8 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(writes.length, 2);
  assert.equal(writes[1].snapshot.title, "Latest");
  assert.equal(writes[1].snapshot.revision, 8);
  assert.equal(writes[1].intent, "published");
  writes[1].done.resolve({
    ...writes[1].snapshot,
    revision: 9,
    publishedRevision: 9,
  });
  assert.equal(await publishing, true);
  await saving;
  assert.equal(current.title, "Latest");
  assert.equal(queue.dirty(), false);
});
test("lost response stops automatic and explicit replay until deliberate recovery", async () => {
  let current = { ...initial, title: "Recover me" };
  let attempts = 0;
  const queue = createDraftSaveQueue({
    initial,
    read: () => current,
    save: async (snapshot) => {
      attempts++;
      if (attempts === 1) throw new Error("response lost");
      return snapshot;
    },
    acknowledge: (saved) => {
      current = saved as typeof current;
    },
    failed: () => {},
  });
  assert.equal(await queue.flush(), false);
  assert.equal(queue.blocked, true);
  await queue.flush();
  await queue.flush("published");
  assert.equal(attempts, 1);
  assert.equal(current.title, "Recover me");
  current = { ...initial };
  queue.reset(current);
  await queue.flush();
  assert.equal(attempts, 1);
});
test("publication comparison includes private answers and restores Published after revert", () => {
  const live = {
    ...initial,
    questions: [
      {
        id: "q",
        prompt: "Pick",
        options: ["A", "B"],
        optionIds: ["a", "b"],
        correctOptionIds: ["a"],
      },
    ],
  };
  const draft = {
    ...live,
    publishedSignature: contentSignature(live),
    revision: 9,
  };
  assert.equal(hasUnpublishedEdits(draft), false);
  assert.equal(
    hasUnpublishedEdits({
      ...draft,
      questions: [{ ...draft.questions[0], correctOptionIds: ["b"] }],
    }),
    true,
  );
  assert.equal(
    hasUnpublishedEdits({
      ...draft,
      revision: 12,
      assignments: [],
      groups: ["different"],
      feedAt: new Date().toISOString(),
    }),
    false,
  );
});
test("edits during a slow request wait for another idle pause before the next draft write", async () => {
  let current: Content = { ...initial, title: "First" };
  const first = deferred<Content>();
  const writes: Content[] = [];
  const queue = createDraftSaveQueue({
    initial,
    idleMs: 30,
    read: () => current,
    save: async (snapshot) => {
      writes.push(snapshot);
      return writes.length === 1 ? first.promise : { ...snapshot, revision: 9 };
    },
    acknowledge: (saved, snapshot) => {
      current =
        contentSignature(current) === contentSignature(snapshot)
          ? saved
          : { ...current, revision: saved.revision };
    },
    failed: () => assert.fail("Unexpected failure"),
  });
  const saving = queue.flush();
  current = { ...current, title: "Still typing" };
  queue.markEdited();
  first.resolve({ ...writes[0], revision: 8 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(writes.length, 1);
  current = { ...current, title: "Final typing" };
  queue.markEdited();
  await saving;
  assert.equal(writes.length, 2);
  assert.equal(writes[1].title, "Final typing");
});
