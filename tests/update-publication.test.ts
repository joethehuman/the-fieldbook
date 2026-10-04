import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import {
  reconcileDemoPublication,
  withPublishedSnapshots,
} from "../lib/demo-publication";
import { updatesForUser } from "../lib/learning-groups";
import { createAdminRuntime } from "../lib/admin-runtime";

test("Update corrections retain For you order; an explicit renewal brings the same item forward", () => {
  let data = withPublishedSnapshots(freshWorkspace());
  const person = data.users.find((user) => user.role === "admin")!;
  const template = data.content.find((item) => item.kind === "brief")!;
  person.groups = ["audience"];
  person.effectiveGroupIds = undefined;
  data.groups = [{ id: "audience", name: "Audience", requiredCourseIds: [] }];
  const updates = [1, 2, 3].map((day) => ({
    ...template,
    id: `update-${day}`,
    title: `Update ${day}`,
    groups: ["audience"],
    status: "published" as const,
    updatedAt: `2026-01-0${day}T00:00:00.000Z`,
    feedAt: undefined,
  }));
  data.content = structuredClone(updates);
  data.publishedContent = structuredClone(updates);
  const change = (
    state: typeof data,
    status: "draft" | "published",
    renew = false,
  ) =>
    reconcileDemoPublication(
      state,
      {
        ...state,
        content: state.content.map((item) =>
          item.id === "update-1"
            ? {
                ...item,
                title: "Corrected typo",
                status,
                updatedAt: "2026-02-01T00:00:00.000Z",
              }
            : item,
        ),
      },
      renew ? "update-1" : undefined,
    );
  const order = (state: typeof data) =>
    updatesForUser(state.publishedContent!, person, data.groups).forYou.map(
      (item) => item.id,
    );
  const originalPublication = structuredClone(data.publishedContent);
  data = change(data, "draft");
  assert.deepEqual(data.publishedContent, originalPublication);
  data = change(data, "published");
  assert.equal(
    data.publishedContent!.find((item) => item.id === "update-1")!.title,
    "Corrected typo",
  );
  assert.equal(
    data.publishedContent!.find((item) => item.id === "update-1")!.feedAt,
    updates[0].updatedAt,
  );
  assert.deepEqual(order(data), ["update-3", "update-2"]);
  data = change(data, "published", true);
  assert.deepEqual(order(data), ["update-1", "update-3"]);
  assert.equal(data.publishedContent!.length, 3);
  assert.deepEqual(data.progress, freshWorkspace().progress);
  const newDraft = {
    ...template,
    id: "first-publication",
    status: "draft" as const,
  };
  const before = { ...data, content: [...data.content, newDraft] };
  const published = reconcileDemoPublication(before, {
    ...before,
    content: before.content.map((item) =>
      item.id === newDraft.id
        ? {
            ...item,
            status: "published" as const,
            updatedAt: "2026-03-01T00:00:00.000Z",
          }
        : item,
    ),
  });
  assert.equal(
    published.publishedContent!.find((item) => item.id === newDraft.id)!.feedAt,
    "2026-03-01T00:00:00.000Z",
  );
});

test("installed editor sends renewal only on explicit Publish, outside the content draft", async () => {
  const data = freshWorkspace();
  const user = data.users.find((person) => person.role === "admin")!;
  const content = {
    ...data.content.find((item) => item.kind === "brief")!,
    revision: 1,
  };
  const requests: any[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    return Response.json({ ...body.content, revision: requests.length + 1 });
  };
  try {
    const runtime = createAdminRuntime({ data, user });
    const draft = await runtime.saveContent(content, "draft", {
      renewUpdate: true,
    });
    await runtime.saveContent(draft, "published", { renewUpdate: true });
    assert.equal(requests[0].renewUpdate, false);
    assert.equal(requests[1].renewUpdate, true);
    assert.equal(requests[1].content.renewUpdate, undefined);
    assert.equal(requests[1].expected, draft.revision);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
