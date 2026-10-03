import test from "node:test";
import assert from "node:assert/strict";
import { resumeDraft, revertToPublished } from "../lib/draft-recovery";
import {
  contentSignature,
  hasUnpublishedEdits,
  reconcileDemoPublication,
  withPublishedSnapshots,
} from "../lib/demo-publication";
import { freshWorkspace } from "../lib/store";
import { seedContent } from "../lib/seed";
import type { Content } from "../lib/types";

const published: Content = {
  ...seedContent.find((item) => item.kind === "course")!,
  revision: 4,
  publishedRevision: 2,
};

test("publishing after a demo revert refreshes the published comparison", () => {
  const data = withPublishedSnapshots(freshWorkspace());
  const snapshot = data.publishedContent![0];
  const live = {
    ...snapshot,
    publishedRevision: data.content.find((item) => item.id === snapshot.id)!
      .publishedRevision,
  };
  const restored = revertToPublished({ ...live, revision: 4 }, live);
  const item = {
    ...restored,
    title: "A new publication",
    status: "published" as const,
  };
  const next = reconcileDemoPublication(data, {
    ...data,
    content: data.content.map((entry) => (entry.id === item.id ? item : entry)),
  });
  const saved = next.content.find((entry) => entry.id === item.id)!;
  assert.equal(hasUnpublishedEdits(saved), false);
  assert.equal(
    next.publishedContent!.find((entry) => entry.id === item.id)!.title,
    item.title,
  );
});

test("revert restores private quiz answers and editorial content without resetting revision, assignments or version", () => {
  const live = structuredClone(published);
  const draft = {
    ...published,
    title: "Unpublished title",
    revision: 9,
    assignments: [
      {
        groupId: "new-group",
        assignedAt: "2026-10-02",
        due: { type: "none" as const },
      },
    ],
    groups: ["new-group"],
    questions: [],
    lessons: [],
  };
  const restored = revertToPublished(draft, live);
  assert.equal(restored.title, live.title);
  assert.deepEqual(restored.questions, live.questions);
  assert.deepEqual(restored.lessons, live.lessons);
  assert.equal(restored.status, "draft");
  assert.equal(restored.revision, 9);
  assert.equal(restored.version, draft.version);
  assert.equal(restored.assignments, draft.assignments);
  assert.equal(restored.groups, draft.groups);
  assert.equal(hasUnpublishedEdits(restored), false);
  restored.lessons[0].body = "New edit after restore";
  assert.notEqual(restored.lessons[0].body, live.lessons[0].body);
});

test("revert rejects the wrong item and a missing publication", () => {
  assert.throws(
    () => revertToPublished(published, { ...published, id: "other" }),
    /unavailable/,
  );
  assert.throws(
    () =>
      revertToPublished(published, { ...published, publishedRevision: null }),
    /unavailable/,
  );
});

test("retry handles both a rejected write and a lost acknowledgement while keeping newer typing", () => {
  const attempted = { ...published, title: "Attempted" };
  const current = { ...attempted, title: "Newest typing" };
  const rejected = resumeDraft(current, published, attempted, published);
  assert.equal(rejected.title, "Newest typing");
  assert.equal(rejected.revision, 4);
  const committed = {
    ...attempted,
    revision: 5,
    publishedSignature: contentSignature(published),
  };
  const recovered = resumeDraft(current, published, attempted, committed);
  assert.equal(recovered.title, "Newest typing");
  assert.equal(recovered.revision, 5);
});

test("retry refuses conflicting edits or a deleted draft, but allows a rejected new draft", () => {
  assert.throws(
    () =>
      resumeDraft(published, published, published, {
        ...published,
        title: "Other author",
        revision: 5,
      }),
    /another session/,
  );
  assert.throws(
    () => resumeDraft(published, published, published, undefined),
    /no longer available/,
  );
  assert.equal(
    resumeDraft(
      { ...published, revision: 0 },
      { ...published, revision: 0 },
      undefined,
      undefined,
    ).revision,
    0,
  );
});

test("retry preserves current assignment references from a checked server draft", () => {
  const saved = {
    ...published,
    revision: 5,
    groups: ["team-group"],
    assignments: [],
  };
  const recovered = resumeDraft(
    { ...published, title: "Open edit" },
    published,
    undefined,
    saved,
  );
  assert.equal(recovered.revision, 5);
  assert.equal(recovered.title, "Open edit");
  assert.equal(recovered.groups, saved.groups);
  assert.equal(recovered.assignments, saved.assignments);
});
