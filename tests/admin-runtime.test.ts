import test from "node:test";
import assert from "node:assert/strict";
import { createAdminRuntime } from "../lib/admin-runtime";
import { freshWorkspace } from "../lib/store";
import { SaveRecoveryError } from "../lib/save-recovery";

test("a recovered settings failure can retry without bypassing content recovery", async () => {
  const originalFetch = globalThis.fetch;
  const before = { ...freshWorkspace(), revision: 1 };
  const user = before.users.find((entry) => entry.role === "admin")!;
  const after = { ...before, settings: { ...before.settings!, name: "Saved retry" } };
  let state = before;
  let settingsWrites = 0;
  let rejectContent = false;
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (path.startsWith("/api/admin/snapshot"))
      return Response.json({ data: state, user });
    if (path === "/api/settings") {
      settingsWrites++;
      if (settingsWrites === 1)
        return Response.json({ error: "Settings service unavailable" }, { status: 503 });
      const body = JSON.parse(String(init?.body));
      assert.equal(body.expected, state.revision);
      state = { ...state, settings: body.settings, revision: state.revision + 1 };
      return Response.json({ revision: state.revision });
    }
    if (path === "/api/content" && rejectContent)
      return Response.json({ error: "Content service unavailable" }, { status: 503 });
    if (path.startsWith("/api/content?id=")) return Response.json(state.content[0]);
    throw new Error(`Unexpected synthetic request: ${path}`);
  };
  try {
    const runtime = createAdminRuntime({ data: before, user });
    await assert.rejects(runtime.save(before, after), (error: unknown) =>
      error instanceof SaveRecoveryError && !!error.snapshot);
    const saved = await runtime.save(before, after);
    assert.equal(settingsWrites, 2);
    assert.equal(saved.settings?.name, "Saved retry");

    rejectContent = true;
    await assert.rejects(runtime.saveContent({ ...saved.content[0], title: "Open unsaved draft" }, "draft"), SaveRecoveryError);
    await assert.rejects(runtime.save(saved, { ...saved, settings: { ...saved.settings!, name: "Blocked during draft recovery" } }), /Refresh and review/);
    assert.equal(settingsWrites, 2);
    await runtime.refresh();
    await runtime.save(state, { ...state, settings: { ...state.settings!, name: "After saved-copy review" } });
    assert.equal(settingsWrites, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Admin retains confirmed saves, accepts a fresh server baseline and keeps its complete open draft", async () => {
  const originalFetch = globalThis.fetch;
  const initial = { ...freshWorkspace(), revision: 1 };
  const user = initial.users.find((entry) => entry.role === "admin")!;
  let state = initial;
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    requests.push(path);
    if (path === "/api/settings") {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.expected, state.revision);
      state = { ...state, settings: body.settings, revision: state.revision + 1 };
      return Response.json({ revision: state.revision });
    }
    if (path === "/api/content") {
      const body = JSON.parse(String(init?.body));
      return Response.json({ ...body.content, revision: body.expected + 1 });
    }
    if (path.startsWith("/api/admin/snapshot"))
      return Response.json({ data: state, user });
    throw new Error(`Unexpected synthetic request: ${path}`);
  };
  try {
    const runtime = createAdminRuntime({ data: initial, user });
    const saved = await runtime.save(initial, {
      ...initial,
      settings: { ...initial.settings!, name: "Saved installation" },
    });
    assert.equal(runtime.snapshot(), saved);
    assert.equal(runtime.snapshot().settings?.name, "Saved installation");
    assert.equal(initial.settings?.name === "Saved installation", false);
    runtime.adoptSnapshot(initial);
    assert.equal(runtime.snapshot().settings?.name, "Saved installation");
    assert.equal(runtime.snapshot().revision, 2);

    const refreshed = {
      ...saved,
      revision: 3,
      settings: { ...saved.settings!, name: "Fresh server installation" },
    };
    const readsBefore = requests.length;
    runtime.adoptSnapshot(refreshed);
    assert.equal(runtime.snapshot(), refreshed);
    assert.equal(await runtime.admin.prepare("content"), refreshed);
    assert.equal(requests.length, readsBefore);

    const content = refreshed.content[0];
    const full = await runtime.saveContent({
      ...content,
      title: "Confirmed draft",
      body: "Complete private draft remains available.",
    }, "draft");
    assert.equal(requests.length, readsBefore + 1);
    assert.equal(runtime.snapshot().settings?.name, "Fresh server installation");
    assert.equal(runtime.snapshot().revision, 3);
    assert.equal(runtime.snapshot().content[0].title, "Confirmed draft");
    assert.equal(runtime.snapshot().content[0].revision, (content.revision || 0) + 1);

    const compactRefresh = {
      ...runtime.snapshot(),
      settings: { ...refreshed.settings, welcomeDescription: "Fresh server welcome" },
      content: runtime.snapshot().content.map((item) => item.id === full.id
        ? { ...item, body: "", lessons: [], questions: [] }
        : item),
    };
    runtime.adoptSnapshot(compactRefresh);
    assert.equal(requests.length, readsBefore + 1);
    assert.equal(runtime.snapshot().settings?.welcomeDescription, "Fresh server welcome");
    assert.equal(runtime.snapshot().content.find((item) => item.id === full.id), full);
    assert.equal(runtime.snapshot().content.find((item) => item.id === full.id)?.body,
      "Complete private draft remains available.");

    const governed = {
      ...runtime.snapshot(),
      governanceRevision: 2,
      groups: [{ ...runtime.snapshot().groups[0], name: "Confirmed group name" }],
    };
    runtime.adoptSnapshot(governed);
    const incomingProgress = { [user.id]: [] };
    runtime.adoptSnapshot({
      ...governed,
      governanceRevision: 1,
      groups: initial.groups,
      progress: incomingProgress,
    });
    assert.equal(runtime.snapshot().governanceRevision, 2);
    assert.equal(runtime.snapshot().groups[0].name, "Confirmed group name");
    assert.equal(runtime.snapshot().progress, incomingProgress);
    assert.equal(requests.length, readsBefore + 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
