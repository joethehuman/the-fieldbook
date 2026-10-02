import test from "node:test";
import assert from "node:assert/strict";
import { prepareAskAi } from "../../server/ask-ai";
import { askAiResponse } from "../../server/ask-ai-response";
import {
  parseAiMessages,
  readAiRequest,
  askAiSettingsSchema,
} from "../../server/ai-schema";
import { defaultAskAiSettings, aiBounds } from "../../lib/ai";
import { defaultSettings, publicSettings } from "../../lib/settings";
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
    askAi: { ...defaultAskAiSettings, enabled: true },
  };
  let current = { ...user },
    fresh = true,
    passages = [passage];
  const calls = { retrieval: 0, plan: 0, answer: 0, validation: 0, current: 0 };
  let answer = "A quorum elects a leader. [S1]";
  const provider: AiProvider = {
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
        "/courses/" + passage.contentId + "?lesson=quorum",
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
    setEnabled: (enabled: boolean) => {
      settings.askAi.enabled = enabled;
    },
    setCurrent: (value: User) => {
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
  };
}
const collect = async <T>(events: AsyncIterable<T>) => {
  const result: T[] = [];
  for await (const event of events) result.push(event);
  return result;
};

test("AI defaults are off, configuration is bounded, public settings reveal only availability", () => {
  assert.equal(defaultAskAiSettings.enabled, false);
  const settings = askAiSettingsSchema.parse({ enabled: true });
  assert.equal(settings.model, "inclusionai/ling-3.1-flash-free");
  for (const invalid of [
    { enabled: true, model: "https://evil.test" },
    { enabled: true, sources: [] },
    { enabled: true, sources: ["doc", "doc"] },
    { enabled: true, guidance: "x".repeat(2001) },
    { enabled: true, apiKey: "secret" },
  ])
    assert.equal(askAiSettingsSchema.safeParse(invalid).success, false);
  const publicValue = publicSettings({ ...defaultSettings, askAi: settings });
  assert.equal(publicValue.askAiEnabled, true);
  assert.equal("askAi" in publicValue, false);
  assert.equal(publicSettings(defaultSettings).askAiEnabled, false);
});

test("anonymous, unregistered, inactive and disabled requests make no model call", async () => {
  for (const denied of [
    null,
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

test("no matching evidence returns a restrained answer without a second model call", async () => {
  const f = fixture();
  f.setPassages([]);
  const events = await collect(
    await prepareAskAi(request(), user, new AbortController().signal, f.deps),
  );
  assert.equal(events.length, 1);
  assert.equal(f.calls.plan, 1);
  assert.equal(f.calls.answer, 0);
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
    "Unknown answer",
    "An invented source. [S99]",
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
  assert.ok(errorBody.includes("Ask AI is unavailable"));
  assert.ok(!errorBody.includes("secret"));
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
