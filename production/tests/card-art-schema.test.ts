import test from "node:test";
import assert from "node:assert/strict";
import { contentSchema, settingsSchema } from "../lib/schemas";
import { governanceSchema } from "../lib/governance-schema";
import { defaultSettings } from "../../lib/settings";
import { seedContent } from "../../lib/seed";

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
    false,
  );
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
    teams: [],
    users: [],
  };
  assert.equal(governanceSchema.safeParse(base).success, true);
  assert.equal(
    governanceSchema.safeParse({
      ...base,
      curricula: [{ ...base.curricula[0], cardArt: art }],
    }).success,
    true,
  );
});
