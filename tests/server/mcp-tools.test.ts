import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcp } from "../../server/mcp";
import { data } from "../../server/data";
import { storage } from "../../server/storage";
import { mediaData } from "../../server/media-data";
import { HttpError } from "../../server/errors";
import { defaultSettings } from "../../lib/settings";
import {
  MCP_CAPABILITIES,
  LEGACY_MCP_CAPABILITIES,
  resolveMcpAccess,
} from "../../lib/mcp-access";
import { mcpContract, mcpOutputSchemas } from "../../lib/mcp-contract";
import type { User, Content } from "../../lib/types";
import type { DocumentRecord } from "../../server/ports/data";

const user: User = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Admin",
  email: "admin@example.test",
  role: "admin",
  active: true,
  registered: true,
  groups: [],
};
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function connect(
  account = user,
  approved: readonly (typeof MCP_CAPABILITIES)[number][] = MCP_CAPABILITIES,
  refresh?: () => Promise<{
    user: User;
    access: ReturnType<typeof resolveMcpAccess>;
  }>,
) {
  const teams = [{ id: "team", name: "Managed team", managerId: account.id }];
  const server = createMcp(
    account,
    "test-client",
    () => {},
    resolveMcpAccess(account, teams, approved),
    refresh,
  );
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
) {
  const response = await client.callTool({ name, arguments: args });
  return {
    error: response.isError === true,
    value: JSON.parse((response.content as { text: string }[])[0].text),
    response,
  };
}

test("SDK advertises the executable contract, role-filtered tools and truthful manual guidance", async () => {
  process.env.FIELDBOOK_URL = "https://fieldbook.example";
  process.env.FIELDBOOK_OWNER_EMAIL = "owner@example.test";
  for (const role of ["admin", "contributor", "manager"] as const) {
    const account = { ...user, role };
    const session = await connect(account);
    try {
      const list = await session.client.listTools();
      assert(list.tools.every((tool) => tool.inputSchema && tool.outputSchema));
      if (role === "admin")
        assert.deepEqual(
          list.tools.map((t) => t.name),
          Object.keys(mcpContract),
        );
      if (role === "contributor")
        assert(
          !list.tools.some((t) =>
            ["content_report", "manage_course_assignment"].includes(t.name),
          ),
        );
      if (role === "manager")
        assert.deepEqual(
          list.tools.map((t) => t.name),
          ["get_capabilities", "get_reporting_scopes", "learning_report"],
        );
      const discovery = await call(session.client, "get_capabilities", {
        operation: "edit privacy policy",
      });
      assert.equal(discovery.error, false);
      assert.equal(discovery.value.unsupported[0].operation, "privacy_policy");
      assert.match(
        discovery.value.unsupported[0].instruction,
        /administrator.*manually|administrator must/i,
      );
      assert.equal(
        discovery.value.unsupported[0].url,
        "https://fieldbook.example/admin",
      );
      assert(
        discovery.value.tools.some(
          (tool: any) =>
            tool.name === "prepare_media_upload" &&
            /transfer/.test(tool.description),
        ),
      );
    } finally {
      await session.close();
    }
  }
  const legacy = await connect(user, LEGACY_MCP_CAPABILITIES);
  try {
    const names = (await legacy.client.listTools()).tools.map((t) => t.name);
    for (const name of [
      "search",
      "fetch",
      "create_content",
      "update_content",
      "publish_content",
      "unpublish_content",
      "content_report",
      "list_media",
    ])
      assert(names.includes(name));
    assert(!names.includes("learning_report"));
    assert(!names.includes("prepare_media_upload"));
    const caps = (await call(legacy.client, "get_capabilities")).value;
    assert(caps.consentRequired.includes("reports:read"));
  } finally {
    await legacy.close();
  }
});

test("real MCP content tools preserve drafts, normalize idempotent retries, enforce revisions and narrow write-only results", async () => {
  const store = data(),
    saved = { ...store },
    docs = new Map<string, DocumentRecord>();
  const config = {
    settings: {
      ...defaultSettings,
      access: "public" as const,
      docSections: [
        { id: "root", name: "Guides" },
        { id: "child", name: "Setup", parentId: "root" },
      ],
    },
    revision: 1,
    governance_revision: 1,
    groups: [],
    teams: [],
    curricula: [],
  };
  Object.assign(store, {
    readConfiguration: async () => config,
    readSettings: async () => ({ settings: config.settings }),
    listDraftIndex: async () => [],
    findDocument: async (key: string) => docs.get(key) || null,
    findReadyMedia: async () => [],
    saveDocument: async (write: any) => {
      const old = docs.get(write.id);
      if ((old?.revision || 0) !== write.expected)
        throw new HttpError(409, "Revision conflict");
      const value = {
        id: write.id,
        revision: (old?.revision || 0) + 1,
        draft: write.draft,
        published: write.publish
          ? write.draft
          : write.unpublish
            ? null
            : old?.published || null,
        published_revision: write.publish
          ? (old?.revision || 0) + 1
          : write.unpublish
            ? null
            : old?.published_revision || null,
        updated_at: write.draft.updatedAt,
      };
      docs.set(write.id, value);
      return value;
    },
    searchMcpCatalog: async () => ({
      items: [
        {
          id: id(1),
          title: "Course",
          summary: "",
          kind: "course",
          revision: 1,
          status: "draft",
          published: false,
        },
      ],
      nextCursor: null,
      complete: true,
    }),
    listMcpMedia: async () => ({ items: [], nextCursor: null, complete: true }),
    readReportInputs: async () => ({
      progress: [],
      feedback: [],
      documents: [],
    }),
    manageLearning: async () => ({ ok: true }),
  });
  const session = await connect();
  try {
    const first = await call(session.client, "create_content", {
      request_id: id(1),
      content: { kind: "course" },
    });
    assert.equal(first.error, false);
    assert.equal(first.value.requirePassing, false);
    const retry = await call(session.client, "create_content", {
      request_id: id(1),
      content: { kind: "course" },
    });
    assert.equal(retry.error, false);
    assert.equal(retry.value.revision, 1);
    assert.equal(docs.size, 1);
    const doc = await call(session.client, "create_content", {
      request_id: id(2),
      content: { kind: "doc", sectionId: "child" },
    });
    assert.equal(doc.error, false);
    assert.equal(doc.value.category, "Guides");
    assert.equal(doc.value.folder, "Setup");
    assert.equal(
      (
        await call(session.client, "create_content", {
          request_id: id(2),
          content: { kind: "doc", sectionId: "child" },
        })
      ).error,
      false,
    );
    const incomplete = await call(session.client, "publish_content", {
      id: id(1),
      expected_revision: 1,
    });
    assert.equal(incomplete.error, true);
    assert.equal(incomplete.value.error.code, "validation_error");
    const content = {
      ...first.value,
      title: "Course",
      summary: "Teach a useful thing",
      category: "Enablement",
      lessons: [
        {
          id: "one",
          title: "Lesson",
          body: "# Intro\n\n**Bold**, _italic_, a list and a [reference](https://example.test).",
        },
      ],
    };
    const update = await call(session.client, "update_content", {
      content,
      expected_revision: 1,
    });
    assert.equal(update.error, false);
    assert.equal(docs.get(id(1))?.published, null);
    const stale = await call(session.client, "update_content", {
      content,
      expected_revision: 1,
    });
    assert.equal(stale.error, true);
    assert.equal(stale.value.error.code, "revision_conflict");
    const published = await call(session.client, "publish_content", {
      id: id(1),
      expected_revision: 2,
    });
    assert.equal(published.error, false);
    assert.equal(published.value.version, 1);
    assert.equal(
      (await call(session.client, "fetch", { id: id(1) })).error,
      false,
    );
    assert.equal(
      (await call(session.client, "search", { query: "lesson" })).value
        .complete,
      true,
    );
    assert.equal(
      (await call(session.client, "list_media")).value.complete,
      true,
    );
    assert.equal(
      (await call(session.client, "content_report")).value.complete,
      true,
    );
    assert.equal(
      (await call(session.client, "get_authoring_options")).value.sections[1]
        .path,
      "Guides / Setup",
    );
    const bumped = await call(session.client, "publish_content", {
      id: id(1),
      expected_revision: 3,
      new_course_version: true,
    });
    assert.equal(bumped.error, false);
    assert.equal(bumped.value.version, 2);
    const assignment = await call(session.client, "manage_course_assignment", {
      id: id(1),
      expected_revision: 4,
      operation: "assign",
      audience: { kind: "team", id: "team" },
    });
    assert.equal(assignment.error, false);
    assert(!("content" in assignment.value));
    assert(!("lessons" in assignment.value));
    const writeOnly = await connect(user, ["content:write"]);
    try {
      const unpublish = await call(writeOnly.client, "unpublish_content", {
        id: id(1),
        expected_revision: 4,
      });
      assert.equal(unpublish.error, false);
      assert(!("body" in unpublish.value));
      assert(!("lessons" in unpublish.value));
      assert(!("questions" in unpublish.value));
    } finally {
      await writeOnly.close();
    }
  } finally {
    await session.close();
    Object.assign(store, saved);
  }
});

test("MCP rechecks permissions at execution before any provider read or mutation", async () => {
  let active = user,
    reads = 0;
  const store = data(),
    old = store.searchMcpCatalog;
  store.searchMcpCatalog = async () => {
    reads++;
    return { items: [], nextCursor: null, complete: true };
  };
  const session = await connect(user, MCP_CAPABILITIES, async () => ({
    user: active,
    access: resolveMcpAccess(active, [], MCP_CAPABILITIES),
  }));
  try {
    active = { ...user, role: "learner" };
    const denied = await call(session.client, "search", { query: "secret" });
    assert.equal(denied.error, true);
    assert.equal(denied.value.error.code, "permission_denied");
    assert.equal(reads, 0);
  } finally {
    await session.close();
    store.searchMcpCatalog = old;
  }
});

test("MCP media completes only owned verified bytes, and supports PUT and resumable transfer contracts", async () => {
  const files = mediaData(),
    oldFiles = { ...files },
    blob = storage(),
    oldStorage = { ...blob };
  const uploads = new Map<string, any>();
  let transferred = false;
  Object.assign(files, {
    allowUpload: async () => true,
    registerUpload: async (row: any) => {
      uploads.set(row.id, row);
    },
    findOwnedUpload: async (key: string, owner: string) => {
      const row = uploads.get(key);
      if (!row || row.owner !== owner)
        throw new HttpError(404, "Upload not found");
      return row;
    },
    markReady: async (key: string) => {
      uploads.get(key).ready = true;
    },
  });
  Object.assign(blob, {
    createUpload: async (path: string, mime: string, bytes: number) =>
      bytes > 6 * 1024 * 1024
        ? {
            protocol: "tus",
            url: "https://storage.example/upload",
            headers: { "x-signature": "temporary" },
            metadata: { path },
            chunkSize: 6 * 1024 * 1024,
          }
        : {
            url: "https://storage.example/upload",
            method: "PUT",
            headers: { "Content-Type": mime },
          },
    metadata: async (path: string) => {
      const row = [...uploads.values()].find((x) => x.path === path);
      return transferred ? { size: row.bytes, mime: row.mime } : null;
    },
  });
  const session = await connect({ ...user, role: "contributor" });
  try {
    const small = await call(session.client, "prepare_media_upload", {
      name: "cover.png",
      type: "image/png",
      size: 100,
    });
    assert.equal(small.error, false);
    assert.equal(small.value.upload.method, "PUT");
    assert(!("url" in small.value));
    const pending = await call(session.client, "complete_media_upload", {
      id: small.value.id,
    });
    assert.equal(pending.error, true);
    transferred = true;
    const complete = await call(session.client, "complete_media_upload", {
      id: small.value.id,
    });
    assert.equal(complete.error, false);
    assert.equal(complete.value.url, `/api/media/${small.value.id}.png`);
    assert.equal(
      (
        await call(session.client, "complete_media_upload", {
          id: small.value.id,
        })
      ).value.url,
      complete.value.url,
    );
    const video = await call(session.client, "prepare_media_upload", {
      name: "lesson.mp4",
      type: "video/mp4",
      size: 7 * 1024 * 1024,
    });
    assert.equal(video.error, false);
    assert.equal(video.value.upload.protocol, "tus");
    assert.equal(
      (await call(session.client, "complete_media_upload", { id: id(90) }))
        .error,
      true,
    );
  } finally {
    await session.close();
    Object.assign(files, oldFiles);
    Object.assign(blob, oldStorage);
  }
});

test("every advertised operation has a matching output contract", () => {
  assert.deepEqual(Object.keys(mcpOutputSchemas), Object.keys(mcpContract));
});

test("SDK report tools validate real service outputs and keep report conflicts actionable", async () => {
  const store = data(),
    saved = { ...store };
  const totals = {
    assigned: {
      total: 1,
      complete: 0,
      overdue: 1,
      not_started: 0,
      in_progress: 0,
    },
    optional: { total: 0, complete: 0, not_started: 0, in_progress: 0 },
  };
  Object.assign(store, {
    readMcpReportingScopes: async () => ({
      organizationWide: true,
      teams: [{ id: "team", name: "Team" }],
      groups: [],
      courses: [{ id: id(3), title: "Course", version: 1 }],
    }),
    readMcpLearningReport: async () => ({
      rows: [],
      total: 1,
      totals,
      hasMore: false,
      fingerprint: "a".repeat(32),
      asOf: "2026-10-02T12:00:00Z",
      dueDatesEnabled: true,
    }),
    readMcpFeedbackReport: async () => ({
      rows: [
        {
          id: id(4),
          contentId: null,
          title: "General feedback",
          kind: "general",
          version: null,
          person: "Member",
          rating: "up",
          comment: "Useful",
          updatedAt: "2026-10-02T12:00:00Z",
        },
      ],
      total: 1,
      hasMore: false,
      fingerprint: "b".repeat(32),
    }),
  });
  const session = await connect();
  try {
    for (const name of [
      "get_reporting_scopes",
      "learning_report",
      "feedback_report",
    ]) {
      const response = await call(session.client, name);
      assert.equal(response.error, false, name);
      assert.deepEqual(response.response.structuredContent, response.value);
      mcpOutputSchemas[name as keyof typeof mcpOutputSchemas].parse(
        response.value,
      );
    }
    store.readMcpLearningReport = async () => {
      throw new HttpError(409, "Report data changed; restart.");
    };
    const changed = await call(session.client, "learning_report");
    assert.equal(changed.error, true);
    assert.equal(changed.value.error.code, "report_changed");
    assert.match(changed.value.error.nextAction, /start|restart/i);
    assert.doesNotMatch(changed.value.error.nextAction, /fetch/i);
  } finally {
    await session.close();
    Object.assign(store, saved);
  }
});
