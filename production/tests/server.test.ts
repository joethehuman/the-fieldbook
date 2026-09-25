import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcp } from "../lib/mcp";
import { redact } from "../lib/content";
import { requireAdmin, HttpError } from "../lib/auth";
import { safeNext } from "../lib/redirect";
import { seedContent } from "../../lib/seed";

test("MCP initializes and advertises read and write tools with appropriate annotations", async () => {
  const user = {
    id: crypto.randomUUID(),
    name: "Admin",
    email: "admin@example.com",
    role: "admin" as const,
    groups: [],
    active: true,
  };
  const server = createMcp(user, "test-client"),
    client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      [
        "search",
        "fetch",
        "create_content",
        "update_content",
        "publish_content",
        "unpublish_content",
        "content_report",
        "list_media",
      ].sort(),
    );
    assert.equal(
      tools.find((t) => t.name === "search")?.annotations?.readOnlyHint,
      true,
    );
    assert.equal(
      tools.find((t) => t.name === "publish_content")?.annotations
        ?.destructiveHint,
      true,
    );
    const invalid = await client.callTool({
      name: "publish_content",
      arguments: { id: "not-a-uuid", expected_revision: 1 },
    });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});
test("learner payloads omit answer keys and assignments, and admin guards reject guests and learners", () => {
  const course = seedContent.find((c) => c.kind === "course")!;
  const clean = redact(course);
  assert.equal(
    clean.questions.some((q) => "answer" in q),
    false,
  );
  assert.deepEqual(clean.groups, []);
  assert.deepEqual(clean.assignments, []);
  assert.equal(
    course.questions.some((q) => q.answer !== undefined),
    true,
  );
  assert.throws(
    () => requireAdmin(null),
    (e: any) => e instanceof HttpError && e.status === 401,
  );
  assert.throws(
    () =>
      requireAdmin({
        id: "test",
        name: "Learner",
        email: "l@example.com",
        role: "learner",
        groups: [],
        active: true,
      }),
    (e: any) => e.status === 403,
  );
});
test("login return destinations cannot redirect to another origin", () => {
  for (const raw of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\n/evil.example",
    "/\t/evil.example",
  ])
    assert.equal(safeNext(raw), "/courses");
  assert.equal(
    safeNext("/oauth/consent?authorization_id=123"),
    "/oauth/consent?authorization_id=123",
  );
  assert.equal(safeNext("/#learn/course"), "/courses");
});

test("MCP's stateless HTTP transport handles initialization and tool discovery", async () => {
  const call = async (body: unknown) => {
    const server = createMcp(
      {
        id: "test",
        name: "Admin",
        email: "admin@example.com",
        role: "admin",
        groups: [],
        active: true,
      },
      "test",
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      const r = await transport.handleRequest(
        new Request("https://fieldbook.example/api/mcp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify(body),
        }),
      );
      return { status: r.status, data: await r.json() };
    } finally {
      await server.close();
    }
  };
  const init = await call({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    },
  });
  assert.equal(init.status, 200);
  assert.equal(init.data.result.serverInfo.name, "fieldbook");
  const list = await call({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  assert.equal(list.status, 200);
  assert.equal(list.data.result.tools.length, 8);
});
