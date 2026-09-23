import { test } from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import {
  withPublishedSnapshots,
  reconcileDemoPublication,
} from "../lib/demo-publication";
import { equivalentMarkdown } from "../lib/markdown-compatibility";

test("demo retains live publication through draft edits, reverts, publishing and unpublishing", () => {
  const initial = withPublishedSnapshots(freshWorkspace());
  const doc = initial.content.find((item) => item.kind === "doc")!;
  const live = structuredClone(
    initial.publishedContent!.find((item) => item.id === doc.id),
  );
  const change = (state: typeof initial, item: typeof doc) =>
    reconcileDemoPublication(state, {
      ...state,
      content: state.content.map((old) => (old.id === item.id ? item : old)),
    });
  const draft = change(initial, {
    ...doc,
    title: "Private new title",
    body: "Private edits",
    status: "draft",
  });
  assert.deepEqual(
    draft.publishedContent!.find((item) => item.id === doc.id),
    live,
  );
  const reopened = withPublishedSnapshots(JSON.parse(JSON.stringify(draft)));
  assert.equal(
    reopened.content.find((item) => item.id === doc.id)!.title,
    "Private new title",
  );
  const published = change(reopened, {
    ...reopened.content.find((item) => item.id === doc.id)!,
    status: "published",
  });
  assert.equal(
    published.publishedContent!.find((item) => item.id === doc.id)!.body,
    "Private edits",
  );
  const unpublished = reconcileDemoPublication(published, {
    ...published,
    content: published.content.filter((item) => item.id !== doc.id),
  });
  assert.equal(
    unpublished.publishedContent!.some((item) => item.id === doc.id),
    false,
  );
  assert.equal(
    unpublished.content.find((item) => item.id === doc.id)!.body,
    "Private edits",
  );
  assert.deepEqual(unpublished.users, initial.users);
  assert.deepEqual(unpublished.progress, initial.progress);
});

test("visual editor compatibility rejects lost links/media/formatting but accepts Markdown normalization", () => {
  assert.ok(equivalentMarkdown("* **One**\n* Two", "- **One**\n- Two\n"));
  assert.ok(
    equivalentMarkdown(
      "![Alt](/api/media/example.png)",
      '![Alt](/api/media/example.png "")\n',
    ),
  );
  assert.equal(
    equivalentMarkdown("A [link](https://example.test)", "A link"),
    false,
  );
  assert.equal(equivalentMarkdown("![Alt](/api/media/example.png)", ""), false);
  assert.equal(
    equivalentMarkdown("<custom>Keep me</custom>", "Keep me"),
    false,
  );
});
