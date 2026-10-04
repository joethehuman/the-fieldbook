import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { ChatTransport } from "ai";
import { createDemoAiTransport } from "../lib/ai-demo";
import { demoAiReply, type AskAiMessage } from "../lib/ai-chat";

function send(
  transport: ChatTransport<AskAiMessage>,
  id: string,
  abortSignal?: AbortSignal,
) {
  return transport.sendMessages({
    chatId: "local-chat",
    trigger: "submit-message",
    messageId: undefined,
    messages: [{ id, role: "user", parts: [{ type: "text", text: "Hello?" }] }],
    abortSignal,
  });
}

async function answer(
  context: TestContext,
  transport: ChatTransport<AskAiMessage>,
  id: string,
) {
  const stream = await send(transport, id);
  context.mock.timers.tick(900);
  for (let word = 0; word < 80; word++) context.mock.timers.tick(45);
  let text = "";
  let finished = false;
  const reader = stream.getReader();
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    const chunk = part.value;
    if (chunk.type === "text-delta") text += chunk.delta;
    if (chunk.type === "finish") finished = true;
  }
  assert.ok(finished);
  return text;
}

test("demo holds thinking before gradually revealing answer words", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const reader = (await send(createDemoAiTransport(), "first")).getReader();
  assert.equal((await reader.read()).value?.type, "start");
  assert.equal((await reader.read()).value?.type, "text-start");
  let arrived = false;
  const first = reader.read().then((chunk) => {
    arrived = true;
    return chunk;
  });
  context.mock.timers.tick(899);
  await Promise.resolve();
  assert.equal(arrived, false);
  context.mock.timers.tick(1);
  assert.deepEqual((await first).value, {
    type: "text-delta",
    id: "answer",
    delta: "Hoolibook ",
  });
  const second = reader.read();
  context.mock.timers.tick(45);
  assert.deepEqual((await second).value, {
    type: "text-delta",
    id: "answer",
    delta: "is ",
  });
  await reader.cancel();
});

test("demo sequence survives cleared history, retries and stays isolated to a session", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const transport = createDemoAiTransport();
  const first = await answer(context, transport, "one");
  assert.equal(
    first,
    "Hoolibook is just a demo, and Gavin didn’t approve the budget for a real model. Visit [thefieldbook.org](https://thefieldbook.org/) to try production Ask AI.",
  );
  assert.equal(await answer(context, transport, "one"), first);
  assert.equal(
    await answer(context, transport, "two"),
    "I escalated your request. Gavin approved a second canned response. That’s this one.",
  );
  // Each request carries only its new question, as after New conversation.
  assert.equal(await answer(context, transport, "three"), demoAiReply);
  assert.equal(await answer(context, transport, "four"), demoAiReply);
  assert.equal(await answer(context, createDemoAiTransport(), "other"), first);
});

for (const phase of ["thinking", "streaming"]) {
  test(`Stop cancels demo ${phase} and retry retains its reply`, async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const transport = createDemoAiTransport();
    const controller = new AbortController();
    const reader = (
      await send(transport, "one", controller.signal)
    ).getReader();
    await reader.read();
    await reader.read();
    if (phase === "streaming") {
      context.mock.timers.tick(900);
      assert.equal((await reader.read()).value?.type, "text-delta");
    }
    const pending = reader.read();
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    context.mock.timers.tick(10_000);
    assert.match(await answer(context, transport, "one"), /^Hoolibook/);
  });
}

test("consumer cancellation clears pending work and an already aborted send consumes no reply", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const transport = createDemoAiTransport();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(send(transport, "aborted", controller.signal), {
    name: "AbortError",
  });
  const reader = (await send(transport, "one")).getReader();
  await reader.cancel();
  context.mock.timers.tick(10_000);
  assert.equal((await reader.read()).done, true);
  assert.match(await answer(context, transport, "one"), /^Hoolibook/);
});

test("the demo reply preserves its production link while installed answers retain citation-only links", async (context) => {
  const { unified } = await import("unified");
  const { default: remarkParse } = await import("remark-parse");
  const { citationLinks } = await import("../lib/ai-citations");
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const text = await answer(context, createDemoAiTransport(), "one");
  const parse = (demo: boolean, text: string) => {
    const processor = unified()
      .use(remarkParse)
      .use(citationLinks, { numbers: {}, demo });
    return JSON.stringify(processor.runSync(processor.parse(text)));
  };
  assert.match(parse(true, text), /"url":"https:\/\/thefieldbook\.org\/"/);
  assert.doesNotMatch(parse(false, text), /"url":/);
  assert.doesNotMatch(
    parse(
      true,
      "Visit [another site](https://example.test) or [fake source](/__fieldbook-citation/1).",
    ),
    /"url":/,
  );
});
