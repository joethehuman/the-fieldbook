import test from "node:test";
import assert from "node:assert/strict";
import { createAdminRuntime } from "../lib/admin-runtime";
import { mergeSavedContent } from "../lib/content-save";
import { freshWorkspace } from "../lib/store";
import { reconcileLearning } from "../lib/learning-groups";
import {
  reconcileDemoPublication,
  withPublishedSnapshots,
  contentSignature,
} from "../lib/demo-publication";
import { SaveRecoveryError } from "../lib/save-recovery";
import type { Content } from "../lib/types";

const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
function fixture() {
  const data = withPublishedSnapshots(freshWorkspace());
  return { data, user: data.users.find((user) => user.role === "admin")! };
}
test("dedicated draft save sends explicit intent and merges one item without a workspace read", async () => {
  const initial = fixture();
  const course = initial.data.content.find((item) => item.kind === "course")!;
  const fetchBefore = globalThis.fetch;
  const requests: { path: string; body: any }[] = [];
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push({ path: String(input), body });
    return response({
      ...body.content,
      revision: 2,
      status: body.publish ? "published" : "draft",
      publishedSignature: contentSignature(course),
    });
  };
  try {
    const runtime = createAdminRuntime(initial);
    const saved = await runtime.saveContent(
      {
        ...course,
        title: "Private edit",
        publishedSignature: contentSignature(course),
      },
      "draft",
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].path, "/api/content");
    assert.equal(requests[0].body.publish, false);
    assert.equal(requests[0].body.expected, course.revision);
    assert.equal(requests[0].body.content.publishedSignature, undefined);
    const cached = await runtime.admin.prepare("content");
    assert.equal(requests.length, 1);
    assert.equal(
      cached.content.find((item) => item.id === course.id)?.title,
      "Private edit",
    );
    assert.equal(cached.publishedContent, initial.data.publishedContent);
    assert.equal(cached.progress, initial.data.progress);
    assert.equal(cached.groups, initial.data.groups);
    assert.equal(saved.version, course.version);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
test("acknowledged publication redacts private answers and preserves unrelated current workspace state", () => {
  const { data } = fixture();
  const course = data.content.find((item) => item.kind === "course")!;
  const saved: Content = {
    ...course,
    status: "published",
    publishedSignature: "private comparison",
    questions: [
      {
        id: "question",
        prompt: "Choose",
        options: ["A", "B"],
        optionIds: ["a", "b"],
        correctOptionIds: ["a"],
        answer: 0,
      },
    ],
  };
  const updated = mergeSavedContent(data, saved);
  const live = updated.publishedContent!.find((item) => item.id === course.id)!;
  assert.equal(live.publishedSignature, undefined);
  assert.equal(live.questions[0].answer, undefined);
  assert.equal(live.questions[0].correctOptionIds, undefined);
  assert.equal(live.questions[0].multiple, false);
  assert.equal(updated.progress, data.progress);
  assert.equal(updated.users, data.users);
  assert.deepEqual(
    updated.content.find((item) => item.id === saved.id)?.questions,
    saved.questions,
  );
});
test("uncertain content response blocks subsequent writes until an explicit refresh", async () => {
  const initial = fixture();
  const course = initial.data.content.find((item) => item.kind === "course")!;
  const fetchBefore = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (input, init) => {
    if (init?.method === "POST") {
      writes++;
      throw new TypeError("response lost");
    }
    if (String(input).startsWith("/api/content?")) return response(course);
    return response(initial);
  };
  try {
    const runtime = createAdminRuntime(initial);
    await assert.rejects(
      () => runtime.saveContent(course, "draft"),
      SaveRecoveryError,
    );
    await assert.rejects(
      () => runtime.saveContent(course, "published"),
      SaveRecoveryError,
    );
    assert.equal(writes, 1);
    await runtime.refresh();
    await assert.rejects(
      () => runtime.saveContent(course, "draft"),
      SaveRecoveryError,
    );
    assert.equal(writes, 2);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
test("workspace mutations wait behind content writes, and their uncertain failure halts queued autosave", async () => {
  const initial = fixture();
  const course = initial.data.content.find((item) => item.kind === "course")!;
  const fetchBefore = globalThis.fetch;
  const writes: string[] = [];
  let finishContent!: () => void;
  const contentGate = new Promise<void>((resolve) => {
    finishContent = resolve;
  });
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (init?.method === "POST") {
      writes.push(path);
      if (path === "/api/content") {
        await contentGate;
        return response({ ...course, revision: 2, status: "draft" });
      }
      throw new TypeError("settings response lost");
    }
    return response(path.startsWith("/api/content?") ? course : initial);
  };
  try {
    const runtime = createAdminRuntime(initial);
    const contentSave = runtime.saveContent(course, "draft");
    const settingsSave = runtime.save(initial.data, {
      ...initial.data,
      settings: { ...initial.data.settings!, name: "New name" },
    });
    const settingsRejected = assert.rejects(settingsSave, SaveRecoveryError);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(writes, ["/api/content"]);
    finishContent();
    await contentSave;
    await settingsRejected;
    await assert.rejects(
      () => runtime.saveContent(course, "draft"),
      SaveRecoveryError,
    );
    assert.deepEqual(writes, ["/api/content", "/api/settings"]);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
test("demo autosaves preserve assigned-course windows, published lessons and progress until explicit version publication", () => {
  const { data } = fixture();
  const before = reconcileLearning(data, data, "2026-09-01T00:00:00.000Z");
  const course = before.content.find(
    (item) => item.kind === "course" && item.assignments?.length,
  )!;
  assert.ok(course);
  const change = (state: typeof before, item: Content, stamp: string) =>
    reconcileLearning(
      state,
      reconcileDemoPublication(state, {
        ...state,
        content: state.content.map((prior) =>
          prior.id === item.id ? { ...item, updatedAt: stamp } : prior,
        ),
      }),
      stamp,
    );
  const draft = change(
    before,
    { ...course, title: "Unfinished new title", status: "draft" },
    "2026-09-10T00:00:00.000Z",
  );
  const saved = draft.content.find((item) => item.id === course.id)!;
  assert.equal(saved.version, course.version);
  assert.deepEqual(saved.assignments, course.assignments);
  assert.deepEqual(draft.progress, before.progress);
  assert.deepEqual(
    draft.publishedContent!.find((item) => item.id === course.id),
    before.publishedContent!.find((item) => item.id === course.id),
  );
  const minorPublish = change(
    draft,
    { ...saved, status: "published" },
    "2026-09-11T00:00:00.000Z",
  );
  assert.deepEqual(
    minorPublish.content.find((item) => item.id === course.id)!.assignments,
    course.assignments,
  );
  const versionPublish = change(
    minorPublish,
    {
      ...minorPublish.content.find((item) => item.id === course.id)!,
      version: course.version + 1,
      status: "published",
    },
    "2026-09-12T00:00:00.000Z",
  );
  assert.equal(
    versionPublish.publishedContent!.find((item) => item.id === course.id)!
      .version,
    course.version + 1,
  );
  assert.ok(
    versionPublish.content
      .find((item) => item.id === course.id)!
      .assignments!.every(
        (assignment) => assignment.assignedAt === "2026-09-12T00:00:00.000Z",
      ),
  );
  assert.deepEqual(versionPublish.progress, before.progress);
});

test("lightweight prefetch shares reads, failed navigation retains the active scope, and person histories cannot be reused for a different account", async () => {
  const initial = fixture();
  const savedFetch = globalThis.fetch;
  const paths: string[] = [];
  let fail = true;
  globalThis.fetch = async (input) => {
    const path = String(input);
    paths.push(path);
    if (path.includes("scope=people") && fail)
      return new Response(JSON.stringify({ error: "List unavailable" }), {
        status: 503,
      });
    if (path.includes("userId=third"))
      return new Response(JSON.stringify({ error: "History unavailable" }), {
        status: 503,
      });
    const personId = new URL(path, "https://example.test").searchParams.get(
      "userId",
    );
    return response({
      data: { ...initial.data, progress: personId ? { [personId]: [] } : {} },
      user: initial.user,
    });
  };
  try {
    const runtime = createAdminRuntime(initial);
    await assert.rejects(runtime.admin.prepare("people"), /List unavailable/);
    await runtime.refresh();
    assert.equal(paths.at(-1), "/api/admin/snapshot?scope=content");
    fail = false;
    runtime.admin.prefetch();
    await runtime.admin.prepare("people");
    assert.equal(
      paths.filter((path) => path.includes("scope=people")).length,
      2,
    );
    assert.ok(!paths.some((path) => path.includes("scope=governance")));
    const first = await runtime.admin.prepare("person", "first");
    const second = await runtime.admin.prepare("person", "second");
    assert.deepEqual(Object.keys(first.progress), ["first"]);
    assert.deepEqual(Object.keys(second.progress), ["second"]);
    await runtime.refresh();
    assert.ok(paths.at(-1)?.includes("scope=person&userId=second"));
    await assert.rejects(
      runtime.admin.prepare("person", "third"),
      /History unavailable/,
    );
    await runtime.refresh();
    assert.ok(paths.at(-1)?.includes("scope=person&userId=second"));
    await runtime.admin.prepare("people");
    await runtime.refresh();
    assert.equal(paths.at(-1), "/api/admin/snapshot?scope=people");
  } finally {
    globalThis.fetch = savedFetch;
  }
});
