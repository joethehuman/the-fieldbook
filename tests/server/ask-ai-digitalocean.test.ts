import test from "node:test";
import assert from "node:assert/strict";
import { digitaloceanAi } from "../../server/providers/digitalocean/ai";
import { ai } from "../../server/ai";
import { aiBounds, aiUnavailableMessage } from "../../lib/ai";

test("DO inference uses native chat requests, bounded tool planning, and plain answer streams", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnvironment = { ...process.env };
  const previousWarn = console.warn;
  const logs: unknown[] = [];
  Object.assign(process.env, {
    DIGITALOCEAN_MODEL_ACCESS_KEY: "synthetic-model-key",
    DIGITALOCEAN_AI_MODELS: "test-chat,test-chat,missing-model",
  });
  console.warn = (...args) => logs.push(args);
  const calls: Record<string, any>[] = [];
  let failure = false;
  const input = {
    model: "test-chat",
    messages: [{ role: "user" as const, text: "How do backups work?" }],
    instructions: "Synthetic policy",
    signal: new AbortController().signal,
  };
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/models"))
      return Response.json({
        data: [
          { id: "test-chat" },
          { id: "not-configured" },
          { id: "embedding-model" },
        ],
      });
    assert.equal(
      String(url),
      "https://inference.do-ai.run/v1/chat/completions",
    );
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer synthetic-model-key",
    );
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    assert.equal(body.model, "test-chat");
    assert.equal(body.max_tokens, undefined);
    if (failure)
      return Response.json(
        { error: { message: "private source and credential" } },
        { status: 402 },
      );
    if (!body.stream) {
      assert.equal(body.max_completion_tokens, aiBounds.planningOutputTokens);
      assert.deepEqual(body.tool_choice, {
        type: "function",
        function: { name: "searchPublishedContent" },
      });
      return Response.json({
        id: "plan",
        model: "test-chat",
        created: 1,
        choices: [
          {
            index: 0,
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "search",
                  type: "function",
                  function: {
                    name: "searchPublishedContent",
                    arguments: JSON.stringify({
                      queries: ["database backups"],
                    }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
    }
    assert.equal(body.max_completion_tokens, aiBounds.answerOutputTokens);
    assert.equal(body.tools, undefined);
    assert.match(body.messages.at(-1).content, /S1/);
    assert.ok(!body.messages.at(-1).content.includes("/docs/example"));
    const chunks = [
      {
        id: "answer",
        model: "test-chat",
        created: 1,
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: "Backups preserve data. [S1]",
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: "answer",
        model: "test-chat",
        created: 1,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      },
    ];
    return new Response(
      chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
        "data: [DONE]\n\n",
      {
        headers: { "content-type": "text/event-stream" },
      },
    );
  };
  try {
    assert.equal(ai({ FIELDBOOK_AI_ROUTER: "digitalocean" }), digitaloceanAi);
    const models = await digitaloceanAi.models(input.signal);
    assert.deepEqual(
      models.map((model) => model.id),
      ["test-chat"],
    );
    assert.equal(models[0].inputPerMillion, null);
    assert.equal(models[0].zeroRetention, "unknown");
    await digitaloceanAi.validateModel("test-chat", input.signal);
    await assert.rejects(
      digitaloceanAi.validateModel("not-configured", input.signal),
      { status: 503 },
    );
    assert.deepEqual(await digitaloceanAi.planSearch(input), [
      "database backups",
    ]);
    const parts: string[] = [];
    for await (const part of digitaloceanAi.streamAnswer({
      ...input,
      sources: [
        {
          id: "S1",
          contentId: "example",
          passageId: "content",
          publishedRevision: 1,
          kind: "doc",
          title: "Backups",
          lessonId: null,
          lessonTitle: null,
          href: "/docs/example",
          text: "Backups preserve data.",
        },
      ],
    }))
      parts.push(part);
    assert.equal(parts.join(""), "Backups preserve data. [S1]");
    assert.ok(parts.length > 1);
    const before = calls.length;
    await assert.rejects(
      digitaloceanAi.planSearch({ ...input, fallbackModel: "not-configured" }),
      { status: 503 },
    );
    assert.equal(calls.length, before);
    failure = true;
    await assert.rejects(digitaloceanAi.planSearch(input), {
      status: 503,
      message: aiUnavailableMessage,
    });
    assert.equal(calls.length, before + 1, "provider refusals are not retried");
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(
      digitaloceanAi.validateModel("test-chat", aborted.signal),
      { name: "AbortError" },
    );
    assert.deepEqual(logs, []);
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnvironment;
    console.warn = previousWarn;
  }
});
