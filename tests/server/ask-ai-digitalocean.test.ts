import test from "node:test";
import assert from "node:assert/strict";
import { digitaloceanAi } from "../../server/providers/digitalocean/ai";
import { ai } from "../../server/ai";
import { aiBounds, aiUnavailableMessage } from "../../lib/ai";

const routerUuid = "123e4567-e89b-12d3-a456-426614174000";
const routerConfig = {
  uuid: routerUuid,
  name: "fieldbook",
  config: {
    policies: [
      {
        custom_task: {
          name: "Published questions",
          description: "Search and answer questions",
        },
        models: ["test-chat"],
      },
    ],
    fallback_models: ["test-backup"],
  },
};
const catalog = ["test-chat", "test-backup"].map((model_id) => ({
  model_id,
  type: "text-to-text",
  availability: ["serverless"],
  capabilities: ["tool_calling"],
}));
function metadataResponse(url: string) {
  if (url.includes("/routers?"))
    return Response.json({
      model_routers: [{ uuid: routerUuid, name: "fieldbook" }],
      meta: { pages: 1 },
    });
  if (url.endsWith(`/routers/${routerUuid}`))
    return Response.json({ model_router: routerConfig });
  if (url.includes("/catalog?"))
    return Response.json({ data: catalog, meta: { pages: 1 } });
  throw Error(`Unexpected metadata URL: ${url}`);
}

test("DO custom router uses scoped discovery, bounded tool planning, and cited answer streams", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnvironment = { ...process.env };
  const previousWarn = console.warn;
  const logs: unknown[] = [];
  Object.assign(process.env, {
    DIGITALOCEAN_MODEL_ACCESS_KEY: "synthetic-model-key",
    DIGITALOCEAN_INFERENCE_ROUTER: "router:fieldbook",
    DIGITALOCEAN_ROUTER_READ_TOKEN: "synthetic-read-key",
    DIGITALOCEAN_VERIFIED_MODELS: "test-chat,test-backup",
  });
  console.warn = (...args) => logs.push(args);
  const calls: Record<string, any>[] = [];
  let failure = false;
  const input = {
    model: "router:fieldbook",
    messages: [{ role: "user" as const, text: "How do backups work?" }],
    instructions: "Synthetic policy",
    signal: new AbortController().signal,
  };
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.digitalocean.com/")) {
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer synthetic-read-key",
      );
      assert.equal(init?.redirect, "error");
      assert.equal(init?.method ?? "GET", "GET");
      return metadataResponse(String(url));
    }
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
    assert.equal(body.model, "router:fieldbook");
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
      ["router:fieldbook"],
    );
    assert.equal(models[0].inputPerMillion, null);
    assert.equal(models[0].zeroRetention, "unknown");
    assert.equal(models[0].validation?.ready, true);
    assert.match(models[0].validation!.message, /2 pool and fallback/);
    assert.match(models[0].validation!.message, /operator-attested/);
    assert.match(models[0].validation!.message, /does not establish/);
    assert.ok(
      catalog.every((entry) => !entry.capabilities.includes("streaming")),
    );
    assert.match(digitaloceanAi.routerSelection!.description, /public preview/);
    await digitaloceanAi.validateModel("router:fieldbook", input.signal);
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
      digitaloceanAi.validateModel("router:fieldbook", aborted.signal),
      { name: "AbortError" },
    );
    assert.deepEqual(logs, []);
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnvironment;
    console.warn = previousWarn;
  }
});

test("Router eligibility rejects implicit pools and every incompatible fallback without generating", async () => {
  const originalFetch = globalThis.fetch;
  const environment = { ...process.env };
  Object.assign(process.env, {
    DIGITALOCEAN_MODEL_ACCESS_KEY: "synthetic-model-key",
    DIGITALOCEAN_INFERENCE_ROUTER: "router:fieldbook",
    DIGITALOCEAN_ROUTER_READ_TOKEN: "synthetic-read-key",
    DIGITALOCEAN_VERIFIED_MODELS: "test-chat,test-backup",
  });
  const signal = new AbortController().signal;
  let config: any = routerConfig;
  let entries: any[] = catalog;
  globalThis.fetch = async (url) => {
    assert.ok(String(url).startsWith("https://api.digitalocean.com/"));
    if (String(url).endsWith(`/routers/${routerUuid}`))
      return Response.json({ model_router: config });
    if (String(url).includes("/catalog?"))
      return Response.json({ data: entries });
    return metadataResponse(String(url));
  };
  try {
    for (const replacement of [
      { ...catalog[1], capabilities: ["streaming"] },
      { ...catalog[1], capabilities: [] },
      { ...catalog[1], type: "embedding" },
      { ...catalog[1], availability: ["dedicated"] },
      { ...catalog[1], model_id: "absent-backup" },
    ]) {
      entries = [catalog[0], replacement];
      const [entry] = await digitaloceanAi.models(signal);
      assert.equal(entry.validation?.ready, false);
      await assert.rejects(digitaloceanAi.validateModel(entry.id, signal), {
        status: 503,
      });
    }
    entries = catalog;
    config = {
      ...routerConfig,
      config: {
        fallback_models: ["test-backup"],
        policies: [{ task_slug: "summarization" }],
      },
    };
    const [implicit] = await digitaloceanAi.models(signal);
    assert.equal(implicit.validation?.ready, false);
    assert.match(implicit.validation!.message, /explicit model pool/);
    await assert.rejects(digitaloceanAi.validateModel(implicit.id, signal), {
      status: 503,
    });
    config = { ...routerConfig, name: "renamed-router" };
    await assert.rejects(digitaloceanAi.models(signal), { status: 503 });
  } finally {
    process.env = environment;
    globalThis.fetch = originalFetch;
  }
});

test("Router discovery paginates independently of the foundation catalog and never follows links", async () => {
  const originalFetch = globalThis.fetch;
  const environment = { ...process.env };
  Object.assign(process.env, {
    DIGITALOCEAN_MODEL_ACCESS_KEY: "synthetic-model-key",
    DIGITALOCEAN_INFERENCE_ROUTER: "router:fieldbook",
    DIGITALOCEAN_ROUTER_READ_TOKEN: "synthetic-read-key",
    DIGITALOCEAN_VERIFIED_MODELS: "test-chat,test-backup",
  });
  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.digitalocean.com");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer synthetic-read-key",
    );
    paths.push(url.pathname + url.search);
    if (
      url.pathname.endsWith("/routers") &&
      url.searchParams.get("page") === "1"
    )
      return Response.json({
        model_routers: [{ uuid: routerUuid, name: "unrelated" }],
        links: {
          pages: { next: "https://untrusted.example/credential-collector" },
        },
      });
    if (url.pathname.endsWith("/catalog"))
      return Response.json({
        data: [catalog[Number(url.searchParams.get("page")) - 1]],
        meta: { pages: 2 },
      });
    return metadataResponse(String(input));
  };
  try {
    const [entry] = await digitaloceanAi.models(new AbortController().signal);
    assert.equal(entry.validation?.ready, true);
    assert.ok(paths.includes("/v2/gen-ai/models/routers?page=2&per_page=100"));
    assert.ok(paths.includes("/v2/gen-ai/models/catalog?page=2&per_page=100"));
    assert.ok(paths.every((path) => !path.includes("/v1/models")));
    process.env.DIGITALOCEAN_INFERENCE_ROUTER = "router:absent";
    await assert.rejects(digitaloceanAi.models(new AbortController().signal), {
      status: 503,
    });
  } finally {
    process.env = environment;
    globalThis.fetch = originalFetch;
  }
});

test("DO configuration requires a custom router and separate read credential, never a deployment token", async () => {
  const originalFetch = globalThis.fetch;
  const environment = { ...process.env };
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw Error("must not connect");
  };
  Object.assign(process.env, {
    DIGITALOCEAN_MODEL_ACCESS_KEY: "synthetic-model-key",
    DIGITALOCEAN_API_TOKEN: "synthetic-deployment-key",
    DIGITALOCEAN_AI_MODELS: "test-chat",
  });
  delete process.env.DIGITALOCEAN_ROUTER_READ_TOKEN;
  try {
    for (const value of [
      "",
      "test-chat",
      "inference-router",
      "router:https://bad.example",
      "router:name with spaces",
      "router:fieldbook",
    ]) {
      process.env.DIGITALOCEAN_INFERENCE_ROUTER = value;
      assert.equal(digitaloceanAi.connection().configured, false);
      await assert.rejects(
        digitaloceanAi.validateModel(value, new AbortController().signal),
        { status: 503 },
      );
    }
    assert.equal(requests, 0);
  } finally {
    process.env = environment;
    globalThis.fetch = originalFetch;
  }
});

test("Router eligibility requires exact operator-tested model IDs and rejects changed pools", async () => {
  const originalFetch = globalThis.fetch;
  const environment = { ...process.env };
  Object.assign(process.env, {
    DIGITALOCEAN_MODEL_ACCESS_KEY: "synthetic-model-key",
    DIGITALOCEAN_INFERENCE_ROUTER: "router:fieldbook",
    DIGITALOCEAN_ROUTER_READ_TOKEN: "synthetic-read-key",
  });
  const signal = new AbortController().signal;
  let config: any = routerConfig;
  let entries: any[] = catalog;
  globalThis.fetch = async (url) => {
    assert.ok(
      String(url).startsWith("https://api.digitalocean.com/"),
      "eligibility must not generate",
    );
    if (String(url).endsWith(`/routers/${routerUuid}`))
      return Response.json({ model_router: config });
    if (String(url).includes("/catalog?"))
      return Response.json({ data: entries });
    return metadataResponse(String(url));
  };
  try {
    for (const value of [
      undefined,
      "",
      "test-chat",
      "test-backup",
      "test-chatty,test-backup",
      "*",
    ]) {
      if (value === undefined) delete process.env.DIGITALOCEAN_VERIFIED_MODELS;
      else process.env.DIGITALOCEAN_VERIFIED_MODELS = value;
      const [entry] = await digitaloceanAi.models(signal);
      assert.equal(entry.validation?.ready, false);
      assert.match(entry.validation!.message, /DIGITALOCEAN_VERIFIED_MODELS/);
      await assert.rejects(digitaloceanAi.validateModel(entry.id, signal), {
        status: 503,
      });
    }
    process.env.DIGITALOCEAN_VERIFIED_MODELS =
      " test-chat, test-backup, test-chat ";
    await digitaloceanAi.validateModel("router:fieldbook", signal);
    entries = [...catalog, { ...catalog[0], model_id: "test-new" }];
    for (const changed of [
      {
        ...routerConfig.config,
        policies: [{ models: ["test-chat", "test-new"] }],
      },
      { ...routerConfig.config, fallback_models: ["test-backup", "test-new"] },
    ]) {
      config = { ...routerConfig, config: changed };
      const [entry] = await digitaloceanAi.models(signal);
      assert.equal(entry.validation?.ready, false);
      await assert.rejects(digitaloceanAi.validateModel(entry.id, signal), {
        status: 503,
      });
    }
    process.env.DIGITALOCEAN_VERIFIED_MODELS += ",test-new";
    await digitaloceanAi.validateModel("router:fieldbook", signal);
  } finally {
    process.env = environment;
    globalThis.fetch = originalFetch;
  }
});

test("Only a declared zero total permits an omitted router list", async () => {
  const originalFetch = globalThis.fetch;
  const environment = { ...process.env };
  Object.assign(process.env, {
    DIGITALOCEAN_MODEL_ACCESS_KEY: "synthetic-model-key",
    DIGITALOCEAN_INFERENCE_ROUTER: "router:fieldbook",
    DIGITALOCEAN_ROUTER_READ_TOKEN: "synthetic-read-key",
    DIGITALOCEAN_VERIFIED_MODELS: "test-chat,test-backup",
  });
  let body: any = { links: {}, meta: { total: 0, page: 1, pages: 1 } };
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes("/routers?"));
    return Response.json(body);
  };
  const signal = new AbortController().signal;
  try {
    await assert.rejects(digitaloceanAi.models(signal), {
      status: 503,
      message:
        "The configured DigitalOcean router was not found. Check its exact router:<name> target.",
    });
    for (const malformed of [
      { links: {}, meta: { total: 1 } },
      { links: {}, meta: { pages: 1 } },
      { links: {} },
      { model_routers: null, meta: { total: 0 } },
      { model_routers: {}, meta: { total: 0 } },
    ]) {
      body = malformed;
      await assert.rejects(digitaloceanAi.models(signal), {
        status: 503,
        message:
          "DigitalOcean router metadata could not be validated. Review its API configuration and model capabilities.",
      });
    }
  } finally {
    process.env = environment;
    globalThis.fetch = originalFetch;
  }
});
