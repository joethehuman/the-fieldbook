import test from "node:test";
import assert from "node:assert/strict";
import { aiSetup } from "../../server/ai-setup";
import { defaultAskAiSettings, type AiModel } from "../../lib/ai";
import { aiModelChoices } from "../../lib/ai-models";
import type { AiProvider } from "../../server/ports/ai";

const admin: any = {
  id: "admin",
  role: "admin",
  active: true,
  registered: true,
};
const model: AiModel = {
  id: "test/primary",
  name: "Synthetic",
  inputPerMillion: 0,
  outputPerMillion: 0,
  zeroRetention: "none",
  noTraining: "none",
};
function fixture() {
  const calls = {
    models: 0,
    retrieval: 0,
    validation: 0,
    planning: 0,
    answer: 0,
  };
  let configured = true,
    current = admin,
    unavailable = false,
    text = "The setup check code is ready. [S1]";
  const provider: AiProvider = {
    name: "Synthetic provider",
    connection: () => ({
      configured,
      message: "Synthetic connection; not authentication proof",
    }),
    async models() {
      calls.models++;
      return [model];
    },
    async validateModel() {
      calls.validation++;
      if (!configured) throw new Error("missing credentials");
    },
    async planSearch() {
      calls.planning++;
      return ["setup check"];
    },
    async *streamAnswer(input) {
      calls.answer++;
      assert.match(
        input.instructions,
        /Supplemental operator guidance:\nBrief answers/,
      );
      assert.equal(input.sources.length, 1);
      assert.match(input.sources[0].text, /synthetic test data/);
      yield text;
    },
  };
  return {
    calls,
    provider,
    deps: {
      provider: () => provider,
      currentUser: async () => current,
      store: {
        async searchAiPassages(queries: string[]) {
          calls.retrieval++;
          assert.deepEqual(queries, []);
          if (unavailable) throw Error("raw storage error");
          return [];
        },
        async areAiSourcesCurrent(sources: unknown[]) {
          calls.retrieval++;
          assert.deepEqual(sources, []);
          return true;
        },
      },
    },
    configure(value: boolean) {
      configured = value;
    },
    user(value: any) {
      current = value;
    },
    missingRetrieval() {
      unavailable = true;
    },
    answer(value: string) {
      text = value;
    },
  };
}
const input = (action: "check" | "test") => ({
  action,
  settings: {
    ...defaultAskAiSettings,
    model: "test/primary",
    guidance: "Brief answers",
  },
});
const signal = () => new AbortController().signal;

test("Admin setup denies signed-out, inactive and non-admin callers before provider or retrieval reads", async () => {
  const f = fixture();
  for (const user of [
    null,
    { ...admin, active: false },
    { ...admin, role: "contributor" },
    { ...admin, role: "learner" },
  ])
    await assert.rejects(aiSetup(input("test"), user, signal(), f.deps));
  assert.deepEqual(f.calls, {
    models: 0,
    retrieval: 0,
    validation: 0,
    planning: 0,
    answer: 0,
  });
});
test("Checking setup distinguishes public metadata and credentials from actual authentication; generates nothing", async () => {
  const f = fixture();
  f.configure(false);
  const result = await aiSetup(input("check"), admin, signal(), f.deps);
  assert.equal(result.setup.connection.configured, false);
  assert.equal(result.setup.catalog.ready, true);
  assert.equal(result.setup.retrieval.ready, true);
  assert.deepEqual(f.calls, {
    models: 1,
    retrieval: 2,
    validation: 0,
    planning: 0,
    answer: 0,
  });
  await assert.rejects(aiSetup(input("test"), admin, signal(), f.deps), {
    status: 503,
  });
  assert.equal(f.calls.planning, 0);
});
test("Missing retrieval is actionable and redacted; blocks test generation", async () => {
  const f = fixture();
  f.missingRetrieval();
  const result = await aiSetup(input("check"), admin, signal(), f.deps);
  assert.equal(result.setup.retrieval.ready, false);
  assert.match(result.setup.retrieval.message, /migration/);
  assert.ok(!JSON.stringify(result).includes("raw storage"));
  await assert.rejects(aiSetup(input("test"), admin, signal(), f.deps), {
    status: 503,
  });
  assert.equal(f.calls.planning, 0);
});
test("Explicit test works while learner AI is off, using two bounded calls and only synthetic data", async () => {
  const f = fixture();
  const result = await aiSetup(input("test"), admin, signal(), f.deps);
  assert.equal(result.answer, "The setup check code is ready. [S1]");
  assert.deepEqual(f.calls, {
    models: 1,
    retrieval: 2,
    validation: 1,
    planning: 1,
    answer: 1,
  });
});
test("Test rechecks administrator status and rejects unverified answers", async () => {
  const f = fixture();
  f.user({ ...admin, role: "learner" });
  await assert.rejects(aiSetup(input("test"), admin, signal(), f.deps), {
    status: 403,
  });
  assert.equal(f.calls.planning, 0);
  f.user(admin);
  for (const answer of [
    "",
    "Unsupported assertion",
    "ready [S1] [S2]",
    "x".repeat(12_001),
  ]) {
    f.answer(answer);
    await assert.rejects(aiSetup(input("test"), admin, signal(), f.deps), {
      status: 502,
    });
  }
});
test("Setup rejects arbitrary prompts, empty sources and oversized guidance; cancellation prevents calls", async () => {
  const f = fixture();
  for (const value of [
    { ...input("test"), prompt: "Spend without bounds" },
    { action: "test", settings: { ...defaultAskAiSettings, sources: [] } },
    {
      action: "test",
      settings: { ...defaultAskAiSettings, guidance: "x".repeat(2_001) },
    },
  ])
    await assert.rejects(aiSetup(value, admin, signal(), f.deps), {
      status: 400,
    });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    aiSetup(input("test"), admin, controller.signal, f.deps),
  );
  assert.equal(f.calls.models, 0);
});

test("Revoking the administrator after planning prevents the second generation", async () => {
  const f = fixture();
  const plan = f.provider.planSearch;
  f.provider.planSearch = async (value) => {
    const queries = await plan(value);
    f.user({ ...admin, active: false });
    return queries;
  };
  await assert.rejects(aiSetup(input("test"), admin, signal(), f.deps), {
    status: 403,
  });
  assert.equal(f.calls.planning, 1);
  assert.equal(f.calls.answer, 0);
});
test("Short model menu orders prices and preserves saved primary/backup choices without inventing unavailable models", () => {
  const models: AiModel[] = Array.from({ length: 10 }, (_, i) => ({
    ...model,
    id: `test/model-${i}`,
    inputPerMillion: i,
    outputPerMillion: i,
  }));
  models.push({
    ...model,
    id: "test/unknown",
    inputPerMillion: null,
    outputPerMillion: null,
  });
  const choices = aiModelChoices(models, "test/unknown", "test/model-9");
  assert.equal(choices.length, 8);
  assert.equal(choices[0].id, "test/model-0");
  assert.equal(choices.at(-2)?.id, "test/unknown");
  assert.equal(choices.at(-1)?.id, "test/model-9");
  assert.ok(
    !choices.some((choice) => choice.id === defaultAskAiSettings.model),
  );
  assert.equal(models.length, 11);
});

test("A separate fallback test uses only the approved backup, never hides its failure with the primary", async () => {
  const f = fixture();
  const ids: string[] = [];
  f.provider.validateModel = async (id) => {
    ids.push(id);
  };
  f.provider.planSearch = async (value) => {
    assert.equal(value.model, "test/backup");
    assert.equal(value.fallbackModel, undefined);
    return ["setup check"];
  };
  const answer = f.provider.streamAnswer;
  f.provider.streamAnswer = (value) => {
    assert.equal(value.model, "test/backup");
    assert.equal(value.fallbackModel, undefined);
    return answer(value);
  };
  const result = await aiSetup(
    {
      ...input("test"),
      action: "test-fallback",
      settings: { ...input("test").settings, fallbackModel: "test/backup" },
    },
    admin,
    signal(),
    f.deps,
  );
  assert.equal(result.model, "test/backup");
  assert.deepEqual(ids, ["test/backup"]);
  await assert.rejects(
    aiSetup(
      { ...input("test"), action: "test-fallback" },
      admin,
      signal(),
      f.deps,
    ),
    { status: 400 },
  );
});
