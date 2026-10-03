import test from "node:test";
import assert from "node:assert/strict";
import { createAdminRuntime } from "../lib/admin-runtime";
import { freshWorkspace } from "../lib/store";

test("assignment preparation retains the open editor's current full draft during recovery", async () => {
  const data = freshWorkspace();
  const user = data.users.find((person) => person.role === "admin")!;
  let draft = { ...data.content.find((item) => item.kind === "brief")!, revision: 1 };
  const catalog = { ...draft, body: "", revision: 1 };
  data.content = [catalog];
  let draftReads = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("/api/content?")) {
      draftReads++;
      return Response.json(draft);
    }
    assert.match(url, /^\/api\/admin\/snapshot\?scope=governance$/);
    return Response.json({ user, data });
  };
  try {
    const runtime = createAdminRuntime({ user, data });
    await runtime.admin.edit(draft.id);
    const prepared = await runtime.admin.prepareAssignments();
    assert.equal(prepared.content[0].body, draft.body);
    draft = { ...draft, revision: 2, updateTeams: ["organization"] };
    const refreshed = await runtime.refresh();
    assert.equal(refreshed.content[0].revision, 2);
    assert.equal(refreshed.content[0].body, draft.body);
    assert.deepEqual(refreshed.content[0].updateTeams, ["organization"]);
    assert.equal(draftReads, 3);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
