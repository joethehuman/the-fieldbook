import test from "node:test";
import assert from "node:assert/strict";
import {
  cardPalettePresets,
  graphemeCount,
  isArtworkOnlyUpdate,
  nextArtSeed,
  resolvedCardArt,
  resolvedCardPalette,
  shortTitleFallback,
  stableArtSeed,
} from "../lib/card-art";
import { seedContent } from "../lib/seed";
import { reconcileDemoPublication } from "../lib/demo-publication";
import { freshWorkspace } from "../lib/store";

test("art seeds and fallback titles stay tied to an item, with many distinct arrangements", () => {
  const title = "Very long launch announcement for everyone";
  const a = resolvedCardArt("course-a", title);
  assert.equal(a.seed, stableArtSeed("course-a"));
  assert.deepEqual(a, resolvedCardArt("course-a", title));
  assert.notEqual(a.seed, resolvedCardArt("course-b", title).seed);
  assert.equal(graphemeCount(shortTitleFallback("🙂".repeat(41))), 40);
  assert.equal(graphemeCount(shortTitleFallback(title)) <= 40, true);
  const seen = new Set(
    Array.from({ length: 200 }, (_, i) => {
      const seed = stableArtSeed(`course-${i}`);
      return [
        seed % 8,
        (seed >>> 8) % 95,
        (seed >>> 17) % 50,
        (seed >>> 23) % 13,
      ].join(":");
    }),
  );
  assert.ok(seen.size >= 100);
  assert.notEqual(nextArtSeed(a.seed), a.seed);
  assert.deepEqual(
    resolvedCardArt("old-course", title, undefined, "/api/media/old.png")
      .source,
    "upload",
  );
});

test("palette follows accent, while presets and custom colors stay fixed", () => {
  const first = resolvedCardPalette({
    accent: "#0069ff",
    cardPalette: { mode: "follow" },
  });
  const second = resolvedCardPalette({
    accent: "#b13567",
    cardPalette: { mode: "follow" },
  });
  assert.notDeepEqual(first, second);
  assert.deepEqual(
    resolvedCardPalette({
      accent: "#b13567",
      cardPalette: { mode: "preset", preset: "dusk" },
    }),
    cardPalettePresets.dusk,
  );
  assert.deepEqual(
    resolvedCardPalette({
      accent: "#0069ff",
      cardPalette: { mode: "preset", preset: "dusk" },
    }),
    cardPalettePresets.dusk,
  );
  const custom = { base: "#111111", accent1: "#222222", accent2: "#333333" };
  assert.deepEqual(
    resolvedCardPalette({
      accent: "#0069ff",
      cardPalette: { mode: "custom", colors: custom },
    }),
    custom,
  );
});

test("published Update artwork corrections retain feed time in demo snapshots", () => {
  const before = freshWorkspace();
  const live = before.content.find((item) => item.kind === "brief")!;
  live.status = "published";
  before.publishedContent = [{ ...live }];
  const next = structuredClone(before);
  const item = next.content.find((entry) => entry.id === live.id)!;
  item.cardArt = { ...resolvedCardArt(item.id, item.title), seed: 1234 };
  item.updatedAt = "2026-09-27T12:00:00.000Z";
  assert.equal(isArtworkOnlyUpdate(item, live), true);
  const result = reconcileDemoPublication(before, next);
  assert.equal(
    result.publishedContent!.find((entry) => entry.id === live.id)!.feedAt,
    live.updatedAt,
  );
  item.summary = "Real editorial change";
  assert.equal(isArtworkOnlyUpdate(item, live), false);
});
