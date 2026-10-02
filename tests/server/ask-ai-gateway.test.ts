import test from "node:test";
import assert from "node:assert/strict";
import { vercelAi } from "../../server/providers/vercel/ai";
import { aiBounds, defaultAskAiSettings } from "../../lib/ai";

test("Gateway adapter uses the installed SDK protocol, forced bounded planning, plain streams and redacted failures", async () => {
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env },
    oldError = console.error,
    oldWarn = console.warn;
  process.env.AI_GATEWAY_API_KEY = "synthetic-server-key";
  const model = defaultAskAiSettings.model;
  const usage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 8, text: 8, reasoning: 0 },
  };
  const signal = new AbortController().signal;
  const input = {
    model,
    messages: [{ role: "user" as const, text: "How does quorum work?" }],
    instructions: "Synthetic fixed policy",
    signal,
  };
  const calls: any[] = [],
    logs: unknown[] = [];
  let mode = "success";
  console.error = (...args) => {
    logs.push(args);
  };
  console.warn = (...args) => {
    logs.push(args);
  };
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/v1/models"))
      return Response.json({
        data: [
          {
            id: model,
            type: "language",
            tags: ["tool-use"],
            supported_parameters: ["reasoning"],
            name: "Synthetic free model",
            pricing: { input: "0", output: "0" },
            zdr: "none",
            no_training: "some",
          },
          { id: "unsupported/model", type: "language", tags: [] },
          {
            id: "synthetic/embedding",
            type: "embedding",
            pricing: { input: "0.00000001" },
          },
          {
            id: "synthetic/video",
            type: "video",
            pricing: { video_duration_pricing: [{ cost_per_second: "0.15" }] },
          },
        ],
      });
    assert.ok(String(url).endsWith("/language-model"));
    const headers = new Headers(init?.headers),
      body = JSON.parse(String(init?.body));
    assert.equal(headers.get("ai-language-model-id"), model);
    assert.equal(headers.get("authorization"), "Bearer synthetic-server-key");
    calls.push(body);
    if (mode === "http-error")
      return Response.json(
        {
          error: {
            type: "invalid_request_error",
            message: "secret credential and source text",
          },
        },
        { status: 400 },
      );
    if (headers.get("ai-language-model-streaming") === "false") {
      assert.deepEqual(body.toolChoice, {
        type: "tool",
        toolName: "searchPublishedContent",
      });
      assert.equal(body.maxOutputTokens, aiBounds.planningOutputTokens);
      assert.equal(body.reasoning, "none");
      assert.ok(!JSON.stringify(body.tools).includes("\\p{L}"));
      return Response.json({
        content: [
          {
            type: "tool-call",
            toolCallId: "search",
            toolName: "searchPublishedContent",
            input: JSON.stringify({
              queries:
                mode === "invalid-plan"
                  ? ["override://untrusted"]
                  : ["quorum election"],
            }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage,
        warnings: [{ type: "other", message: "secret provider warning" }],
      });
    }
    assert.equal(body.maxOutputTokens, aiBounds.answerOutputTokens);
    assert.equal(body.tools, undefined);
    assert.ok(body.prompt.at(-1).content[0].text.includes('"id":"S1"'));
    assert.ok(!body.prompt.at(-1).content[0].text.includes("/courses/"));
    const chunks =
      mode === "stream-error"
        ? [{ type: "error", error: "secret model failure" }]
        : [
            {
              type: "stream-start",
              warnings: [{ type: "other", message: "secret provider warning" }],
            },
            { type: "text-start", id: "answer" },
            {
              type: "text-delta",
              id: "answer",
              delta: "A quorum elects a leader. [S1]",
            },
            { type: "text-end", id: "answer" },
            {
              type: "finish",
              finishReason: {
                unified: mode === "length" ? "length" : "stop",
                raw: "stop",
              },
              usage,
            },
          ];
    return new Response(
      chunks.map((chunk) => "data: " + JSON.stringify(chunk) + "\n\n").join(""),
      { headers: { "content-type": "text/event-stream" } },
    );
  };
  const sources = [
    {
      id: "S1",
      contentId: "synthetic",
      passageId: "content",
      publishedRevision: 7,
      kind: "course" as const,
      title: "Systems",
      lessonId: null,
      lessonTitle: null,
      href: "/courses/synthetic",
      text: "A quorum elects a leader.",
    },
  ];
  const answer = async () => {
    let text = "";
    for await (const chunk of vercelAi.streamAnswer({ ...input, sources }))
      text += chunk;
    return text;
  };
  try {
    const catalog = await vercelAi.models(signal);
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0].inputPerMillion, 0);
    assert.equal(catalog[0].zeroRetention, "none");
    assert.equal(catalog[0].noTraining, "some");
    assert.equal(calls.length, 0); // public catalog access is not authentication
    await vercelAi.validateModel(model, signal);
    await assert.rejects(vercelAi.validateModel("unsupported/model", signal), {
      status: 503,
    });
    assert.deepEqual(await vercelAi.planSearch(input), ["quorum election"]);
    assert.equal(await answer(), "A quorum elects a leader. [S1]");
    mode = "invalid-plan";
    await assert.rejects(vercelAi.planSearch(input), { status: 503 });
    mode = "http-error";
    const count = calls.length;
    await assert.rejects(
      vercelAi.planSearch(input),
      (error: any) => error.status === 503 && !error.message.includes("secret"),
    );
    assert.equal(calls.length, count + 1); // maxRetries=0
    mode = "stream-error";
    await assert.rejects(
      answer(),
      (error: any) => error.status === 503 && !error.message.includes("secret"),
    );
    mode = "length";
    await assert.rejects(answer(), { status: 503 });
    assert.deepEqual(logs, []);
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
    console.error = oldError;
    console.warn = oldWarn;
  }
});
