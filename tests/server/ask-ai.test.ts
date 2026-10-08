import test from "node:test";
import assert from "node:assert/strict";
import { prepareAskAi, answerPolicy } from "../../server/ask-ai";
import { askAiResponse } from "../../server/ask-ai-response";
import { HttpError } from "../../server/errors";
import {
  parseAiMessages,
  readAiRequest,
  askAiSettingsSchema,
} from "../../server/ai-schema";
import {
  defaultAskAiSettings,
  aiBounds,
  aiUnavailableMessage,
} from "../../lib/ai";
import { defaultSettings, publicSettings } from "../../lib/settings";
import { messageSources, type AskAiMessage } from "../../lib/ai-chat";
import type { User } from "../../lib/types";
import type { SourcePassage } from "../../lib/search";
import type { AiProvider } from "../../server/ports/ai";

const user: User = {
  id: "reader",
  name: "Reader",
  email: "reader@example.test",
  role: "learner",
  groups: [],
  active: true,
  registered: true,
};
const request = (text = "How does quorum work?") => ({
  messages: [{ role: "user", parts: [{ type: "text", text }] }],
});
const passage: SourcePassage = {
  contentId: "00000000-0000-4000-8000-000000000001",
  passageId: "lesson:quorum",
  kind: "course",
  title: "Systems",
  lessonId: "quorum",
  lessonTitle: "Consensus",
  text: "A quorum elects a leader.",
  publishedRevision: 7,
  contentDate: null,
};
function fixture() {
  let settings = {
    ...defaultSettings,
    askAi: {
      ...defaultAskAiSettings,
      enabled: true,
      router: "synthetic",
      model: "test/primary",
    },
  };
  let current: User | null = { ...user };
  let fresh = true,
    passages = [passage];
  const calls = { retrieval: 0, plan: 0, answer: 0, validation: 0, current: 0 };
  let answer = "A quorum elects a leader. [S1]";
  const provider: AiProvider = {
    id: "synthetic",
    name: "Synthetic",
    supportsFallback: true,
    connection: () => ({ configured: true, message: "Synthetic" }),
    async models() {
      return [];
    },
    async validateModel() {
      calls.validation++;
    },
    async planSearch(input) {
      calls.plan++;
      assert.equal(input.messages.at(-1)?.text, "How does quorum work?");
      return ["quorum election"];
    },
    async *streamAnswer(input) {
      calls.answer++;
      assert.equal(
        input.sources[0].href,
        "/courses/systems-" + passage.contentId.replaceAll("-", "") + "?lesson=quorum",
      );
      yield answer;
    },
  };
  const deps = {
    store: {
      async readSettings() {
        return {
          settings,
          revision: 1,
          governance_revision: 1,
          groups: [],
          teams: [],
          curricula: [],
        };
      },
      async searchAiPassages(queries: string[]) {
        calls.retrieval++;
        return queries.length ? passages : [];
      },
      async areAiSourcesCurrent() {
        calls.current++;
        return fresh;
      },
    },
    provider: () => provider,
    async currentUser() {
      return current;
    },
  };
  return {
    deps,
    calls,
    provider,
    setAccess: (access: "public" | "private") => {
      settings.access = access;
    },
    setEnabled: (enabled: boolean) => {
      settings.askAi.enabled = enabled;
    },
    setCurrent: (value: User | null) => {
      current = value;
    },
    setFresh: (value: boolean) => {
      fresh = value;
    },
    setPassages: (value: SourcePassage[]) => {
      passages = value;
    },
    setAnswer: (value: string) => {
      answer = value;
    },
    setGuidance: (value: string) => {
      settings.askAi.guidance = value;
    },
  };
}
const collect = async <T>(events: AsyncIterable<T>) => {
  const result: T[] = [];
  for await (const event of events) result.push(event);
  return result;
};

test("operator guidance reaches generation without a conflicting fixed length rule", async () => {
  const f = fixture();
  const guidance =
    "Explain clearly in two readable paragraphs. Include useful detail.";
  f.setGuidance(guidance);
  const generate = f.provider.streamAnswer;
  f.provider.streamAnswer = async function* (input) {
    assert.ok(input.instructions.includes(answerPolicy));
    assert.ok(input.instructions.endsWith(guidance));
    assert.ok(input.instructions.includes("Operator answer guidance"));
    assert.doesNotMatch(answerPolicy, /sentences|paragraphs|three distinct/);
    yield* generate(input);
  };
  await collect(
    await prepareAskAi(request(), user, new AbortController().signal, f.deps),
  );
  assert.equal(f.calls.answer, 1);
});

test("responses without citations finish normally without extra model calls", async () => {
  for (const answer of [
    "Hi! What would you like to know?",
    "The published content does not answer that question.",
  ]) {
    const f = fixture();
    f.setAnswer(answer);
    const controller = new AbortController();
    const response = askAiResponse(
      await prepareAskAi(request(), user, controller.signal, f.deps),
      controller,
    );
    const wire = await response.text();
    assert.match(wire, /"type":"finish","finishReason":"stop"/);
    assert.match(wire, /"type":"data-sources","data":\[\]/);
    assert.doesNotMatch(wire, /"type":"error"/);
    assert.equal(f.calls.plan, 1);
    assert.equal(f.calls.answer, 1);
    assert.equal(f.calls.current, 2);
  }
});

test("AI defaults are off, configuration is bounded, public settings reveal only availability", () => {
  assert.equal(defaultAskAiSettings.enabled, false);
  const empty = askAiSettingsSchema.parse({ enabled: false });
  assert.equal(empty.model, "");
  assert.equal(empty.fallbackModel, "");
  assert.equal(askAiSettingsSchema.safeParse({ enabled: true }).success, false);
  assert.equal(
    askAiSettingsSchema.safeParse({
      enabled: true,
      model: "test/primary",
      fallbackModel: "test/primary",
    }).success,
    false,
  );
  const settings = askAiSettingsSchema.parse({
    enabled: true,
    model: "test/primary",
  });
  assert.equal(settings.model, "test/primary");
  assert.equal(settings.fallbackModel, "");
  for (const invalid of [
    { enabled: true, model: "https://evil.test" },
    { enabled: true, sources: [] },
    { enabled: true, sources: ["doc", "doc"] },
    { enabled: true, guidance: "x".repeat(2001) },
    { enabled: true, apiKey: "secret" },
  ])
    assert.equal(
      askAiSettingsSchema.safeParse({ ...settings, ...invalid }).success,
      false,
    );
  const publicValue = publicSettings({ ...defaultSettings, askAi: settings });
  assert.equal(publicValue.askAiEnabled, true);
  assert.equal("askAi" in publicValue, false);
  assert.equal(publicSettings(defaultSettings).askAiEnabled, false);
});

test("unregistered, inactive and disabled requests make no model call", async () => {
  for (const denied of [
    { ...user, registered: false },
    { ...user, active: false },
  ]) {
    const f = fixture();
    await assert.rejects(
      prepareAskAi(request(), denied, new AbortController().signal, f.deps),
      { status: denied?.active === false ? 403 : 401 },
    );
    assert.deepEqual(f.calls, {
      retrieval: 0,
      plan: 0,
      answer: 0,
      validation: 0,
      current: 0,
    });
  }
  const f = fixture();
  f.setEnabled(false);
  await assert.rejects(
    prepareAskAi(request(), user, new AbortController().signal, f.deps),
    { status: 403 },
  );
  assert.equal(f.calls.plan, 0);
  assert.equal(f.calls.retrieval, 0);
});

test("public guests use published evidence; private guests and disabled AI make no model call", async () => {
  const publicSite = fixture();
  publicSite.setAccess("public");
  publicSite.setCurrent(null);
  const events = await collect(
    await prepareAskAi(
      request(),
      null,
      new AbortController().signal,
      publicSite.deps,
    ),
  );
  assert.equal(events.at(-1)?.type, "sources");
  assert.equal(publicSite.calls.plan, 1);
  assert.equal(publicSite.calls.answer, 1);
  for (const mode of ["private", "off"] as const) {
    const f = fixture();
    f.setCurrent(null);
    f.setAccess(mode === "private" ? "private" : "public");
    if (mode === "off") f.setEnabled(false);
    await assert.rejects(
      prepareAskAi(request(), null, new AbortController().signal, f.deps),
      { status: mode === "private" ? 401 : 403 },
    );
    assert.deepEqual(f.calls, {
      retrieval: 0,
      plan: 0,
      answer: 0,
      validation: 0,
      current: 0,
    });
  }
});
test("guest access and session changes are rechecked before answers and final citations", async () => {
  for (const stage of ["before-answer", "before-citations"] as const) {
    for (const change of ["private", "sign-in", "off"] as const) {
      const f = fixture();
      f.setAccess("public");
      f.setCurrent(null);
      const revoke = () => {
        if (change === "private") f.setAccess("private");
        if (change === "sign-in") f.setCurrent(user);
        if (change === "off") f.setEnabled(false);
      };
      if (stage === "before-citations")
        f.provider.streamAnswer = async function* () {
          yield "A quorum elects a leader. [S1]";
          revoke();
        };
      const events = await prepareAskAi(
        request(),
        null,
        new AbortController().signal,
        f.deps,
      );
      if (stage === "before-answer") revoke();
      await assert.rejects(collect(events), {
        status: change === "off" ? 403 : 401,
      });
      if (stage === "before-answer") assert.equal(f.calls.answer, 0);
    }
  }
  const f = fixture();
  const events = await prepareAskAi(
    request(),
    user,
    new AbortController().signal,
    f.deps,
  );
  f.setCurrent(null);
  await assert.rejects(collect(events), { status: 401 });
  assert.equal(f.calls.answer, 0);
});

test("Changing routers or unsupported fallback blocks retrieval and generation until configuration is reviewed", async () => {
  for (const change of ["router", "fallback"]) {
    const f = fixture();
    if (change === "router")
      f.deps.provider = () => ({ ...f.provider, id: "different" });
    else {
      f.deps.provider = () => ({ ...f.provider, supportsFallback: false });
      const read = f.deps.store.readSettings;
      f.deps.store.readSettings = async () => {
        const config = await read();
        return {
          ...config,
          settings: {
            ...config.settings,
            askAi: { ...config.settings.askAi, fallbackModel: "backup" },
          },
        };
      };
    }
    await assert.rejects(
      prepareAskAi(request(), user, new AbortController().signal, f.deps),
      { status: 503 },
    );
    assert.equal(f.calls.retrieval, 0);
    assert.equal(f.calls.plan, 0);
    assert.equal(f.calls.answer, 0);
  }
});

test("migration preflight fails before any model generation", async () => {
  const f = fixture();
  f.deps.store.searchAiPassages = async () => {
    throw new Error("missing migration");
  };
  await assert.rejects(
    prepareAskAi(request(), user, new AbortController().signal, f.deps),
    /missing migration/,
  );
  assert.equal(f.calls.plan, 0);
  assert.equal(f.calls.validation, 0);
});

test("one plan and one answer expose verified lesson links without source bodies", async () => {
  const f = fixture();
  const events = await collect(
    await prepareAskAi(request(), user, new AbortController().signal, f.deps),
  );
  assert.equal(f.calls.plan, 1);
  assert.equal(f.calls.answer, 1);
  assert.equal(f.calls.current, 2);
  assert.equal(events[0].type, "text");
  const last = events.at(-1)!;
  assert.equal(last.type, "sources");
  if (last.type === "sources") {
    assert.equal(last.sources[0].publishedRevision, 7);
    assert.equal(last.sources[0].lessonId, "quorum");
    assert.equal("text" in last.sources[0], false);
  }
  // The service depends on read operations only, with no transcript or usage write port.
  assert.equal(Object.keys(f.deps.store).length, 3);
});

test("empty evidence still reaches the bounded answer step regardless of punctuation", async () => {
  for (const text of [
    "Hi!",
    "hello?",
    "hello",
    "Thanks!",
    "How does quorum work?",
  ]) {
    const f = fixture();
    f.setPassages([]);
    f.provider.planSearch = async (input) => {
      f.calls.plan++;
      assert.equal(input.messages.at(-1)?.text, text);
      return ["hello"];
    };
    const answer =
      text === "How does quorum work?"
        ? "The published content does not answer that question. Try Search."
        : "Hi! What would you like to know?";
    f.provider.streamAnswer = async function* (input) {
      f.calls.answer++;
      assert.equal(input.messages.at(-1)?.text, text);
      assert.deepEqual(input.sources, []);
      assert.match(input.instructions, /regardless of punctuation/);
      assert.match(
        input.instructions,
        /If no evidence is supplied, do not invent an answer/,
      );
      assert.match(
        input.instructions,
        /factual questions from general knowledge/,
      );
      yield answer;
    };
    const events = await collect(
      await prepareAskAi(
        request(text),
        user,
        new AbortController().signal,
        f.deps,
      ),
    );
    assert.deepEqual(events, [
      { type: "text", text: answer },
      { type: "sources", sources: [] },
    ]);
    assert.equal(f.calls.plan, 1);
    assert.equal(f.calls.answer, 1);
    assert.equal(f.calls.current, 0);
  }
});

test("empty evidence cannot issue invented source links and still rechecks access", async () => {
  for (const revoke of [false, true]) {
    const f = fixture();
    f.setPassages([]);
    f.provider.streamAnswer = async function* () {
      if (revoke) f.setEnabled(false);
      yield "An unsupported answer. [S1]";
    };
    await assert.rejects(
      collect(
        await prepareAskAi(
          request(),
          user,
          new AbortController().signal,
          f.deps,
        ),
      ),
      revoke ? /Ask AI is unavailable/ : /source links couldn’t be verified/,
    );
  }
});

test("four supplied citations complete the SDK stream and retain every internal source link", async () => {
  const f = fixture(),
    controller = new AbortController();
  f.setPassages(
    Array.from({ length: 5 }, (_, index) => ({
      ...passage,
      passageId: `lesson:${index ? `topic-${index}` : "quorum"}`,
      lessonId: index ? `topic-${index}` : "quorum",
    })),
  );
  // Match the reported shape: four distinct sources, repeated across paragraphs.
  const answer = "Use the published setup. [S2][S4]\n\nVerify it. [S3][S4][S5]";
  f.setAnswer(answer);
  const response = askAiResponse(
    await prepareAskAi(request(), user, controller.signal, f.deps),
    controller,
  );
  const chunks = (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)));
  assert.equal(
    chunks.some((chunk) => chunk.type === "error"),
    false,
  );
  assert.deepEqual(chunks.at(-1), { type: "finish", finishReason: "stop" });
  const sources = chunks.find((chunk) => chunk.type === "data-sources")?.data;
  assert.deepEqual(
    sources?.map((source: { id: string }) => source.id),
    ["S2", "S4", "S3", "S5"],
  );
  assert.ok(sources.every((source: object) => !("text" in source)));
  const message: AskAiMessage = {
    id: "answer",
    role: "assistant",
    parts: [
      { type: "text", text: answer },
      { type: "data-sources", data: sources },
    ],
  };
  assert.deepEqual(messageSources(message), sources);
  assert.equal(f.calls.plan, 1);
  assert.equal(f.calls.answer, 1);
  assert.equal(f.calls.current, 2);
});

test("fresh account, settings and source checks guard generation and final citations", async () => {
  for (const change of ["off", "inactive", "content"] as const) {
    const f = fixture();
    const events = await prepareAskAi(
      request(),
      user,
      new AbortController().signal,
      f.deps,
    );
    if (change === "off") f.setEnabled(false);
    if (change === "inactive") f.setCurrent({ ...user, active: false });
    if (change === "content") f.setFresh(false);
    await assert.rejects(collect(events));
    assert.equal(f.calls.answer, 0);
  }
  const f = fixture();
  f.provider.streamAnswer = async function* () {
    yield "A quorum elects a leader. [S1]";
    f.setFresh(false);
  };
  const iterator = (
    await prepareAskAi(request(), user, new AbortController().signal, f.deps)
  )[Symbol.asyncIterator]();
  assert.equal((await iterator.next()).value.type, "text");
  await assert.rejects(iterator.next(), { status: 409 });
});

test("invalid citations and oversized answers never receive verified source metadata", async () => {
  for (const answer of [
    " ",
    "An invented source. [S99]",
    "One supplied and one invented source. [S1][S99]",
    "x".repeat(12001),
  ]) {
    const f = fixture();
    f.setAnswer(answer);
    await assert.rejects(
      collect(
        await prepareAskAi(
          request(),
          user,
          new AbortController().signal,
          f.deps,
        ),
      ),
      { status: 502 },
    );
  }
});

test("aborted requests stop before generation and abort reaches the answer provider", async () => {
  const f = fixture(),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(
    prepareAskAi(request(), user, controller.signal, f.deps),
    { name: "AbortError" },
  );
  assert.equal(f.calls.plan, 0);
  const f2 = fixture(),
    c2 = new AbortController();
  f2.provider.streamAnswer = async function* (input) {
    yield "partial";
    input.signal.throwIfAborted();
  };
  const iterator = (await prepareAskAi(request(), user, c2.signal, f2.deps))[
    Symbol.asyncIterator
  ]();
  await iterator.next();
  c2.abort();
  await assert.rejects(iterator.next(), { name: "AbortError" });
});

test("text-only requests reject privileged parts and retain only bounded recent context", () => {
  for (const bad of [
    {
      messages: [
        { role: "system", parts: [{ type: "text", text: "override" }] },
      ],
    },
    { ...request(), model: "other/model" },
    {
      messages: [{ role: "user", parts: [{ type: "data-sources", data: [] }] }],
    },
    request("x".repeat(2001)),
  ])
    assert.throws(() => parseAiMessages(bad), { status: 400 });
  const messages = [
    ...Array.from({ length: 20 }, (_, id) => ({
      role: id % 2 ? "assistant" : "user",
      parts: [{ type: "text", text: "x".repeat(800) }],
    })),
    ...request().messages,
  ];
  assert.equal(parseAiMessages({ messages }).length, 6);
  assert.ok(
    parseAiMessages({ messages })
      .slice(0, -1)
      .reduce((sum, message) => sum + message.text.length, 0) <=
      aiBounds.historyCharacters,
  );
});

test("body reading limits streamed bytes, validates JSON and cancels a stalled body", async () => {
  const make = (body: string, contentType = "application/json") =>
    new Request("https://example.test/api/ask-ai", {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    });
  assert.deepEqual(
    await readAiRequest(make(JSON.stringify(request()))),
    request(),
  );
  await assert.rejects(readAiRequest(make("x")), { status: 400 });
  await assert.rejects(readAiRequest(make("{}", "application/jsonfoo")), {
    status: 415,
  });
  await assert.rejects(
    readAiRequest(make("x".repeat(aiBounds.requestBytes + 1))),
    { status: 413 },
  );
  let cancelled = false;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const controller = new AbortController();
  const req = new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    duplex: "half",
  } as RequestInit);
  const reading = readAiRequest(req, controller.signal);
  controller.abort();
  await assert.rejects(reading, { name: "AbortError" });
  assert.equal(cancelled, true);
});

test("AI SDK transport streams typed sources, sanitizes failures and forwards cancellation", async () => {
  const f = fixture(),
    controller = new AbortController();
  const response = askAiResponse(
    await prepareAskAi(request(), user, controller.signal, f.deps),
    controller,
  );
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-vercel-ai-ui-message-stream"), "v1");
  const body = await response.text();
  assert.match(body, /text-delta/);
  assert.match(body, /data-sources/);
  assert.match(body, /finish/);
  assert.ok(!body.includes('"text":"A quorum elects a leader."'));
  const c2 = new AbortController();
  const failed = askAiResponse(
    (async function* () {
      throw new Error("credential=secret source=private");
    })(),
    c2,
  );
  const errorBody = await failed.text();
  assert.ok(errorBody.includes(aiUnavailableMessage));
  assert.ok(!errorBody.includes("secret"));
  const safe = askAiResponse(
    (async function* () {
      throw new HttpError(503, "PRIVATE adapter setup detail");
    })(),
    new AbortController(),
  );
  const safeBody = await safe.text();
  assert.ok(safeBody.includes(aiUnavailableMessage));
  assert.ok(!safeBody.includes("PRIVATE"));
  const c3 = new AbortController();
  const pending = askAiResponse(
    (async function* () {
      yield { type: "text", text: "partial" } as const;
      await new Promise<void>((resolve) =>
        c3.signal.addEventListener("abort", () => resolve(), { once: true }),
      );
    })(),
    c3,
  );
  const reader = pending.body!.getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(c3.signal.aborted, true);
});

test("A missing primary may use only the saved backup; admission and source validation still apply", async () => {
  const f = fixture();
  const originalRead = f.deps.store.readSettings;
  f.deps.store.readSettings = async () => {
    const record = await originalRead();
    record.settings.askAi.fallbackModel = "test/backup";
    return record;
  };
  const validated: string[] = [];
  f.provider.validateModel = async (id) => {
    validated.push(id);
    if (id === "test/primary") throw new Error("primary unavailable");
  };
  const plan = f.provider.planSearch,
    answer = f.provider.streamAnswer;
  f.provider.planSearch = (input) => {
    assert.equal(input.fallbackModel, "test/backup");
    return plan(input);
  };
  f.provider.streamAnswer = (input) => {
    assert.equal(input.fallbackModel, "test/backup");
    return answer(input);
  };
  const result = await collect(
    await prepareAskAi(
      {
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "How does quorum work?" }],
          },
        ],
      },
      user,
      new AbortController().signal,
      f.deps,
    ),
  );
  assert.deepEqual(validated, ["test/primary", "test/backup"]);
  assert.ok(result.some((event: any) => event.type === "sources"));
  const saved = await f.deps.store.readSettings();
  assert.equal(saved.settings.askAi.model, "test/primary");
  f.setEnabled(false);
  await assert.rejects(
    prepareAskAi(
      {
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "How does quorum work?" }],
          },
        ],
      },
      user,
      new AbortController().signal,
      f.deps,
    ),
    { status: 403 },
  );
});
