import test from "node:test";
import assert from "node:assert/strict";
import { createDocsNavigationSaver } from "../lib/docs-navigation-save";
import { applyDemoBulk, type BulkRequest } from "../lib/bulk-actions";
import { freshWorkspace } from "../lib/store";
import { defaultSettings } from "../lib/settings";
import { deleteDocSection } from "../lib/docs-navigation";
import type { Content } from "../lib/types";

function fixture() {
  const data = freshWorkspace();
  const template = data.content.find((item) => item.kind === "doc")!;
  data.content = ["first", "second"].map((id): Content => ({
    ...template,
    id,
    title: id,
    sectionId: "source",
    category: "Source",
    folder: "",
    body: "Unsaved draft text",
    revision: 3,
    publishedRevision: 1,
  }));
  data.publishedContent = data.content.map((item) => ({
    ...item,
    body: "Published text",
    revision: 1,
  }));
  data.revision = 4;
  data.settings = {
    ...defaultSettings,
    ...data.settings,
    docCategoryOrder: [],
    docSections: [{ id: "source", name: "Source" }],
  };
  return data;
}
function harness(
  options: {
    conflict?: boolean;
    lostResponse?: boolean;
    failedSettings?: boolean;
    failedFinal?: boolean;
    mismatchedPublished?: boolean;
  } = {},
) {
  let current = fixture();
  const actor = current.users.find((user) => user.role === "admin")!;
  const requests: { path: string; body: any }[] = [];
  const save = createDocsNavigationSaver(
    async (path, body: any) => {
      requests.push({ path, body: structuredClone(body) });
      if (path.startsWith("/api/content?"))
        return current.publishedContent!.find(
          (item) =>
            item.id ===
            new URL(path, "https://example.test").searchParams.get("id"),
        );
      if (path === "/api/settings") {
        if (
          options.failedSettings ||
          (options.failedFinal &&
            requests.filter((request) => request.path === path).length > 1)
        )
          throw new Error("Settings unavailable");
        assert.equal(body.expected, current.revision);
        const old = current.settings!.docSections!;
        for (const section of old)
          if (
            !body.settings.docSections.some(
              (item: any) => item.id === section.id,
            )
          )
            deleteDocSection(old, section.id, [
              ...current.content,
              ...current.publishedContent!,
            ]);
        current = {
          ...current,
          settings: body.settings,
          revision: current.revision! + 1,
        };
        return { revision: current.revision, settings: current.settings };
      }
      if (options.conflict) current.content[1].revision = 10;
      const result = applyDemoBulk(current, actor, body as BulkRequest);
      current = result.data;
      if (options.mismatchedPublished) current.publishedContent!.forEach((item) => { item.sectionId = "source"; });
    if (options.lostResponse) throw new Error("Connection lost after commit");
      return { results: result.results };
    },
    async () => structuredClone(current),
  );
  return {
    before: structuredClone(current),
    save,
    requests,
    current: () => current,
  };
}
const moves = ["first", "second"].map((id) => ({
  id,
  sectionId: "target",
  expected: 3,
}));
const desired = (before: ReturnType<typeof fixture>) => ({
  ...before.settings!,
  docSections: [
    { id: "target", name: "Target", docOrder: ["second", "first"] },
  ],
});

test("save creates destination, moves metadata and then removes the empty source", async () => {
  const h = harness();
  const result = await h.save(h.before, desired(h.before), moves);
  assert.deepEqual(result.remaining, []);
  assert.equal(result.error, undefined);
  assert.equal(h.requests[0].path, "/api/settings");
  assert.deepEqual(
    h.requests[0].body.settings.docSections.map((s: any) => s.id),
    ["target", "source"],
  );
  assert.deepEqual(
    result.data.settings!.docSections!.map((s) => s.id),
    ["target"],
  );
  for (const doc of result.data.content) {
    assert.equal(doc.sectionId, "target");
    assert.equal(doc.body, "Unsaved draft text");
    assert.equal(doc.publishedRevision, 1);
  }
  for (const doc of result.data.publishedContent!) {
    assert.equal(doc.sectionId, "target");
    assert.equal(doc.body, "Published text");
  }
});

test("revision conflicts retain failed moves and source section; explicit retry cannot overwrite the edited draft", async () => {
  const h = harness({ conflict: true });
  const result = await h.save(h.before, desired(h.before), moves);
  assert.deepEqual(
    result.remaining.map((item) => item.id),
    ["second"],
  );
  assert.match(result.error!, /Review 1 unconfirmed item/);
  assert.ok(
    result.data.settings!.docSections!.some(
      (section) => section.id === "source",
    ),
  );
  assert.equal(result.data.content[1].sectionId, "source");
  const retry = await h.save(result.data, desired(h.before), result.remaining);
  assert.deepEqual(
    retry.remaining.map((item) => item.id),
    ["second"],
  );
  assert.equal(retry.data.content[1].revision, 10);
  const successes = h.requests.filter(
    (request) => request.path === "/api/admin/bulk",
  );
  assert.deepEqual(successes[1].body.items, [{ id: "second", expected: 3 }]);
});

test("lost metadata response is confirmed with a read and is never replayed", async () => {
  const h = harness({ lostResponse: true });
  const result = await h.save(h.before, desired(h.before), moves);
  assert.deepEqual(result.remaining, []);
  assert.equal(result.error, undefined);
  assert.equal(
    h.requests.filter((request) => request.path === "/api/admin/bulk").length,
    1,
  );
  assert.ok(result.data.content.every((item) => item.revision === 4));
});

test("failed initial settings save writes no document metadata", async () => {
  const h = harness({ failedSettings: true });
  await assert.rejects(
    h.save(h.before, desired(h.before), moves),
    /settings couldn’t be saved/,
  );
  assert.equal(
    h.requests.filter((request) => request.path === "/api/admin/bulk").length,
    0,
  );
  assert.deepEqual(h.current().content, h.before.content);
});

test("failed final section deletion reports saved document moves and retains the actual baseline", async () => {
  const h = harness({ failedFinal: true });
  const result = await h.save(h.before, desired(h.before), moves);
  assert.deepEqual(result.remaining, []);
  assert.match(result.error!, /documents were moved/);
  assert.ok(result.data.content.every((item) => item.sectionId === "target"));
  assert.ok(
    result.data.settings!.docSections!.some(
      (section) => section.id === "source",
    ),
  );
});


test("lost responses cannot be confirmed from the draft index when the actual published placement differs", async () => {
  const h = harness({ lostResponse: true, mismatchedPublished: true });
  const result = await h.save(h.before, desired(h.before), moves);
  assert.equal(result.remaining.length, 2);
  assert.match(result.error!, /move couldn’t be confirmed/);
  assert.equal(h.requests.filter((request) => request.path.startsWith("/api/content?")).length, 2);
  assert.equal(h.requests.filter((request) => request.path === "/api/admin/bulk").length, 1);
});
