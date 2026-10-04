import test from "node:test";
import assert from "node:assert/strict";
import {
  contentSchema,
  contentDraftSchema,
  settingsSchema,
} from "../../server/schemas";
import { governanceSchema } from "../../server/governance-schema";
import { defaultSettings } from "../../lib/settings";
import { seedContent } from "../../lib/seed";
import { mcpContract } from "../../lib/mcp-contract";

const art = {
  source: "generated" as const,
  shortTitle: "A useful update",
  version: 1 as const,
  seed: 123,
};
const update = {
  ...seedContent.find((item) => item.kind === "brief")!,
  id: "00000000-0000-4000-8000-000000000012",
};
const imageUrl = "/api/media/00000000-0000-4000-8000-000000000013.png";

test("artwork schema accepts older items and validates saved titles and images", () => {
  assert.equal(contentSchema.safeParse(update).success, true);
  assert.equal(
    contentSchema.safeParse({ ...update, cardArt: art }).success,
    true,
  );
  assert.equal(
    contentSchema.safeParse({ ...update, cardArt: { ...art, shortTitle: "" } })
      .success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({
      ...update,
      cardArt: { ...art, shortTitle: "🙂".repeat(41) },
    }).success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({
      ...update,
      cardArt: { ...art, source: "upload", imageUrl },
    }).success,
    true,
  );
  assert.equal(
    contentSchema.safeParse({
      ...update,
      cardArt: {
        ...art,
        source: "upload",
        imageUrl: "https://outside.example/card.png",
      },
    }).success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({ ...update, cardArt: { ...art, version: 2 } })
      .success,
    true,
  );
  assert.equal(
    contentSchema.safeParse({ ...update, cardArt: { ...art, version: 7 } })
      .success,
    false,
  );
});

test("published, draft and MCP schemas preserve v1-v6 artwork and reject unknown versions", () => {
  for (const version of [1, 2, 3, 4, 5, 6]) {
    const cardArt = { ...art, version, seed: 4294967295 };
    assert.deepEqual(
      contentSchema.parse({ ...update, cardArt }).cardArt,
      cardArt,
    );
    assert.deepEqual(
      contentDraftSchema.parse({ ...update, cardArt }).cardArt,
      cardArt,
    );
    const parsed = mcpContract.create_content.inputSchema.parse({
      content: { kind: "course", cardArt },
    });
    assert.deepEqual(parsed.content.cardArt, cardArt);
  }
  for (const version of [0, 7, -1, 1.5, "3"]) {
    const cardArt = { ...art, version };
    assert.equal(
      contentSchema.safeParse({ ...update, cardArt }).success,
      false,
    );
    assert.equal(
      contentDraftSchema.safeParse({ ...update, cardArt }).success,
      false,
    );
    assert.equal(
      mcpContract.create_content.inputSchema.safeParse({
        content: { kind: "course", cardArt },
      }).success,
      false,
    );
  }
  for (const seed of [-1, 4294967296, 0.5]) {
    assert.equal(
      contentDraftSchema.safeParse({
        ...update,
        cardArt: { ...art, version: 6, seed },
      }).success,
      false,
    );
  }
});

test("palette schema validates custom colors and preset keys", () => {
  assert.equal(settingsSchema.safeParse(defaultSettings).success, true);
  assert.equal(
    settingsSchema.safeParse({
      ...defaultSettings,
      cardPalette: { mode: "preset", preset: "dusk" },
    }).success,
    true,
  );
  assert.equal(
    settingsSchema.safeParse({
      ...defaultSettings,
      cardPalette: { mode: "preset", preset: "unknown" },
    }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({
      ...defaultSettings,
      cardPalette: {
        mode: "custom",
        colors: { base: "#ffffff", accent1: "#123456", accent2: "red" },
      },
    }).success,
    false,
  );
});

test("curriculum schema keeps artwork optional for older MCP clients", () => {
  const base = {
    expected: 1,
    curricula: [
      {
        id: "curriculum-1",
        name: "First steps",
        description: "A path",
        courseIds: [],
        status: "draft",
      },
    ],
    groups: [],
    teams: [
      { id: "organization", name: "Organization", system: "organization" },
    ],
    users: [],
  };
  assert.equal(governanceSchema.safeParse(base).success, true);
  for (const version of [1, 2, 3, 4, 5, 6]) {
    const cardArt = { ...art, version };
    const parsed = governanceSchema.parse({
      ...base,
      curricula: [{ ...base.curricula[0], cardArt }],
    });
    assert.deepEqual(parsed.curricula![0].cardArt, cardArt);
  }
  assert.equal(
    governanceSchema.safeParse({
      ...base,
      curricula: [{ ...base.curricula[0], cardArt: { ...art, version: 7 } }],
    }).success,
    false,
  );
});
