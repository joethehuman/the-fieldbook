import test from "node:test";
import assert from "node:assert/strict";
import { aiSetup } from "../../server/ai-setup";
import { ai } from "../../server/ai";
import { requireAiRouter, selectionRouter } from "../../server/ai-router";
import { defaultAskAiSettings, type AiModel } from "../../lib/ai";
import { askAiSettingsSchema } from "../../lib/ai-schema";
import { aiModelChoices } from "../../lib/ai-models";
import type { AiProvider } from "../../server/ports/ai";

const admin: any = {
  id: "admin",
  role: "admin",
  active: true,
  registered: true,
};
const model: AiModel = {
  id: "local-model:version",
  name: "Synthetic",
  inputPerMillion: null,
  outputPerMillion: null,
  zeroRetention: "unknown",
  noTraining: "unknown",
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
    unavailable = false;
  const provider: AiProvider = {
    id: "synthetic",
    name: "Synthetic router",
    supportsFallback: false,
    connection: () => ({
      configured,
      message: "Synthetic configuration; not authentication proof",
    }),
    async models() {
      calls.models++;
      return [model];
    },
    async validateModel() {
      calls.validation++;
    },
    async planSearch() {
      calls.planning++;
      return ["setup check"];
    },
    async *streamAnswer() {
      calls.answer++;
      yield "Unexpected generation";
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
          if (unavailable) throw Error("raw storage secret");
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
  };
}
const input = { action: "check", settings: defaultAskAiSettings };
const signal = () => new AbortController().signal;

test("Router selection is explicit, independent of host; unknown selectors fail closed", () => {
  assert.equal(ai({ FIELDBOOK_AI_ROUTER: "vercel", VERCEL: "0" }).id, "vercel");
  assert.equal(ai({}).id, "vercel"); // Existing installations remain compatible.
  for (const id of ["none", "unknown", ""])
    assert.throws(() => ai({ FIELDBOOK_AI_ROUTER: id }), { status: 503 });
});
test("Saved models belong to a router, including legacy Vercel choices; unsupported fallback is rejected", () => {
  const f = fixture();
  assert.equal(selectionRouter(defaultAskAiSettings), "vercel");
  assert.throws(() => requireAiRouter(defaultAskAiSettings, f.provider), {
    status: 409,
  });
  assert.doesNotThrow(() =>
    requireAiRouter(
      { ...defaultAskAiSettings, router: "synthetic", model: model.id },
      f.provider,
    ),
  );
  assert.throws(
    () =>
      requireAiRouter(
        {
          ...defaultAskAiSettings,
          router: "synthetic",
          fallbackModel: "backup",
        },
        f.provider,
      ),
    { status: 400 },
  );
  assert.doesNotThrow(() => requireAiRouter(defaultAskAiSettings, ai({})));
  assert.ok(
    askAiSettingsSchema.safeParse({
      ...defaultAskAiSettings,
      enabled: true,
      router: "synthetic",
      model: model.id,
    }).success,
  );
  for (const id of ["https://evil.test", "/path", "model with space"])
    assert.ok(
      !askAiSettingsSchema.safeParse({ ...defaultAskAiSettings, model: id })
        .success,
    );
});
test("Metadata denies inactive, signed-out and non-admin callers before reads", async () => {
  const f = fixture();
  for (const user of [
    null,
    { ...admin, active: false },
    { ...admin, role: "contributor" },
    { ...admin, role: "learner" },
  ])
    await assert.rejects(aiSetup(input, user, signal(), f.deps));
  assert.equal(f.calls.models, 0);
  assert.equal(f.calls.retrieval, 0);
});
test("Metadata describes the selected connector without authentication claims or generation", async () => {
  const f = fixture();
  f.configure(false);
  const result = await aiSetup(input, admin, signal(), f.deps);
  assert.deepEqual(result.setup.router, {
    id: "synthetic",
    name: "Synthetic router",
    supportsFallback: false,
  });
  assert.equal(result.setup.selectionRouter, "vercel");
  assert.equal(result.setup.connection.configured, false);
  assert.equal(result.setup.catalog.ready, true);
  assert.equal(result.setup.retrieval.ready, true);
  assert.equal(result.setup.models[0].id, model.id);
  assert.deepEqual(f.calls, {
    models: 1,
    retrieval: 2,
    validation: 0,
    planning: 0,
    answer: 0,
  });
});
test("Unavailable router and storage produce generic setup warnings, never raw errors", async () => {
  const f = fixture();
  f.missingRetrieval();
  const result = await aiSetup(input, admin, signal(), f.deps);
  assert.equal(result.setup.retrieval.ready, false);
  assert.match(result.setup.retrieval.message, /database setup/);
  assert.ok(!JSON.stringify(result).includes("raw storage secret"));
  const absent = await aiSetup(input, admin, signal(), {
    ...f.deps,
    provider: () => {
      throw Error("raw configuration secret");
    },
  });
  assert.equal(absent.setup.router, null);
  assert.equal(absent.setup.connection.configured, false);
  assert.ok(!JSON.stringify(absent).includes("raw configuration secret"));
  assert.equal(f.calls.models, 1);
  assert.equal(f.calls.retrieval, 2);
});
test("Metadata refresh rechecks administrator identity; cancellation prevents reads", async () => {
  const f = fixture();
  f.user({ ...admin, role: "learner" });
  await assert.rejects(aiSetup(input, admin, signal(), f.deps), {
    status: 403,
  });
  f.user({ ...admin, id: "other" });
  await assert.rejects(aiSetup(input, admin, signal(), f.deps), {
    status: 401,
  });
  const fresh = fixture(),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(aiSetup(input, admin, controller.signal, fresh.deps));
  assert.equal(fresh.calls.models, 0);
});
test("Removed generation actions and unbounded metadata requests are rejected before reads", async () => {
  const f = fixture();
  for (const value of [
    { ...input, action: "test" },
    { ...input, action: "test-fallback" },
    { ...input, prompt: "unbounded" },
    { ...input, settings: { ...defaultAskAiSettings, sources: [] } },
    {
      ...input,
      settings: { ...defaultAskAiSettings, guidance: "x".repeat(2001) },
    },
  ])
    await assert.rejects(aiSetup(value, admin, signal(), f.deps), {
      status: 400,
    });
  assert.deepEqual(f.calls, {
    models: 0,
    retrieval: 0,
    validation: 0,
    planning: 0,
    answer: 0,
  });
});

test("Full model menu orders prices and includes every compatible choice without changing the catalog", () => {
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
  const choices = aiModelChoices(models);
  assert.equal(choices.length, 11);
  assert.equal(choices[0].id, "test/model-0");
  assert.equal(choices.at(-2)?.id, "test/model-9");
  assert.equal(choices.at(-1)?.id, "test/unknown");
  assert.deepEqual(
    models.slice(0, 10).map((m) => m.id),
    Array.from({ length: 10 }, (_, i) => `test/model-${i}`),
  );
  assert.ok(
    !choices.some((choice) => choice.id === defaultAskAiSettings.model),
  );
  assert.equal(models.length, 11);
});
