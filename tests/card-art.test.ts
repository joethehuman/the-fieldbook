import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  artComposition,
  CARD_ART_COMPOSITIONS,
  CARD_ART_VERSION,
  cardPalettePresets,
  graphemeCount,
  isArtworkOnlyUpdate,
  randomArtSeed,
  resolvedCardArt,
  resolvedCardPalette,
  shortTitleFallback,
  stableArtSeed,
  type CardArt,
} from "../lib/card-art";
import { expandedArtStructure } from "../lib/card-art-library";
import { CardArtworkV3 } from "../components/patterns/card-artwork-v3";
import { CardArtworkV5 } from "../components/patterns/card-artwork-v5";
import { CardArtworkV6 } from "../components/patterns/card-artwork-v6";
import { CardArtworkV4 } from "../components/patterns/card-artwork-v4";
import { cardArtStructure } from "../lib/card-art-composition";
import { CardArtwork } from "../components/patterns/card-artwork";
import {
  freshWorkspace as currentWorkspace,
  loadWorkspace,
  saveWorkspace,
} from "../lib/store";
import { reconcileDemoPublication } from "../lib/demo-publication";
import { legacyWorkspace as freshWorkspace } from "./fixtures/legacy-workspace";

test("art seeds and fallback titles stay tied to an item, with many distinct arrangements", () => {
  const title = "Very long launch announcement for everyone";
  const a = resolvedCardArt("course-a", title);
  assert.equal(a.seed, stableArtSeed("course-a"));
  assert.equal(a.version, 2);
  assert.equal(CARD_ART_VERSION, 6);
  assert.deepEqual(a, resolvedCardArt("course-a", title));
  assert.notEqual(a.seed, resolvedCardArt("course-b", title).seed);
  assert.equal(graphemeCount(shortTitleFallback("🙂".repeat(41))), 40);
  assert.equal(graphemeCount(shortTitleFallback(title)) <= 40, true);
  const seen = new Set(
    Array.from({ length: 200 }, (_, i) => {
      const seed = stableArtSeed(`course-${i}`);
      return artComposition(seed);
    }),
  );
  assert.equal(seen.size, CARD_ART_COMPOSITIONS);
  assert.deepEqual(
    resolvedCardArt("old-course", title, undefined, "/api/media/old.png")
      .source,
    "upload",
  );
});

test("saved artwork versions and absent-art fallbacks are not silently upgraded", () => {
  for (const version of [1, 2, 3, 4, 5, 6] as const) {
    const saved: CardArt = {
      source: "generated",
      shortTitle: "Saved design",
      version,
      seed: 4294967295,
    };
    assert.strictEqual(resolvedCardArt("item", "Renamed title", saved), saved);
    const uploaded = {
      ...saved,
      source: "upload" as const,
      imageUrl: "/api/media/image.png",
    };
    assert.strictEqual(
      resolvedCardArt("item", "Renamed title", uploaded),
      uploaded,
    );
  }
  const legacy = resolvedCardArt("item", "Original title");
  assert.equal(legacy.version, 2);
  assert.equal(resolvedCardArt("item", "Renamed title").seed, legacy.seed);
  assert.equal(
    resolvedCardArt("item", "Renamed title").shortTitle,
    "Renamed title",
  );
  assert.equal(
    resolvedCardArt("item", "Title", undefined, "/api/media/legacy.png")
      .version,
    2,
  );
});

test("legacy SVG geometry matches the pre-v3 rendering fixtures", () => {
  // Captured from main's v1/v2 renderers before the v3 integration. Cover every
  // legacy family/recipe plus a seed exercising the high-bit transforms.
  const expected = {
    1: "baf8413126ccc8c9f30accbfb22f8e8ecfa1e0d2aca6701b39dedc2dc7858f43",
    2: "5f8a2f3eb8322797d09f20319b1b0b4ed5efc5df1b80d356dc14f29ce855a9bd",
  };
  for (const version of [1, 2] as const) {
    const seeds = [
      ...Array.from({ length: version === 1 ? 8 : 30 }, (_, i) => i),
      4294967295,
    ];
    const frames = seeds.map(
      (seed) =>
        renderToStaticMarkup(
          createElement(CardArtwork, {
            id: "compatibility",
            title: "A title",
            kind: "course",
            category: "Build the essentials",
            art: {
              source: "generated",
              shortTitle: "Choose a problem worth solving",
              version,
              seed,
            },
          }),
        ).match(/<svg[^>]*>[\s\S]*?<\/svg>/)![0],
    );
    assert.equal(
      createHash("sha256").update(frames.join("\n")).digest("hex"),
      expected[version],
    );
  }
});

test("v3 structure is a stable seed contract with bounded independent axes", () => {
  assert.deepEqual([0, 1, 29, 30, 256, 4294967295].map(cardArtStructure), [
    { family: 0, recipe: 0, rhythm: 0, proportion: 0, placement: 2 },
    { family: 1, recipe: 0, rhythm: 2, proportion: 0, placement: 0 },
    { family: 9, recipe: 2, rhythm: 2, proportion: 2, placement: 1 },
    { family: 0, recipe: 0, rhythm: 2, proportion: 1, placement: 2 },
    { family: 6, recipe: 1, rhythm: 1, proportion: 2, placement: 0 },
    { family: 5, recipe: 1, rhythm: 2, proportion: 2, placement: 0 },
  ]);
  for (let slot = 0; slot < 30; slot++) {
    const levels = {
      rhythm: new Set(),
      proportion: new Set(),
      placement: new Set(),
    };
    for (let i = 0; i < 100; i++) {
      // This stride keeps both recipe and tone fixed, so structure must have
      // real variation independent of those existing choices.
      const seed = slot + i * 7680;
      const structure = cardArtStructure(seed);
      assert.equal(structure.family, slot % 10);
      assert.equal(structure.recipe, Math.floor(slot / 10));
      for (const axis of ["rhythm", "proportion", "placement"] as const) {
        assert.ok([0, 1, 2].includes(structure[axis]));
        levels[axis].add(structure[axis]);
      }
    }
    for (const values of Object.values(levels)) assert.equal(values.size, 3);
  }
});

test("demo save and reload preserve each generator choice and leave missing artwork absent", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    const workspace = currentWorkspace();
    for (const [index, version] of ([1, 2, 3, 4, 5, 6] as const).entries()) {
      workspace.content[index].cardArt = {
        source: "generated",
        shortTitle: "Kept after reload",
        version,
        seed: 1234567890 + index,
      };
    }
    delete workspace.content[6].cardArt;
    saveWorkspace(workspace);
    const loaded = loadWorkspace();
    for (const item of workspace.content.slice(0, 7)) {
      const restored = loaded.content.find(
        (candidate) => candidate.id === item.id,
      )!;
      assert.deepEqual(restored.cardArt, item.cardArt);
      assert.deepEqual(
        resolvedCardArt(restored.id, restored.title, restored.cardArt),
        resolvedCardArt(item.id, item.title, item.cardArt),
      );
    }
    saveWorkspace(loaded);
    assert.deepEqual(
      loadWorkspace().content.map((item) => item.cardArt),
      loaded.content.map((item) => item.cardArt),
    );
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

test("Shuffle draws a new seed and avoids recent compositions and families", () => {
  const recent = Array.from({ length: 12 }, (_, i) => i);
  const candidates = [0, 21, 22];
  const seed = randomArtSeed(recent, () => candidates.shift()!);
  assert.equal(seed, 22);
  assert.equal(artComposition(seed), 22);
  assert.equal(
    randomArtSeed(recent, () => 0),
    12,
  );
  let candidate = 0;
  const history = [0];
  for (let i = 0; i < 24; i++) {
    const next = randomArtSeed(
      history,
      () => candidate++ % CARD_ART_COMPOSITIONS,
    );
    history.push(next);
  }
  assert.equal(new Set(history.map((seed) => artComposition(seed))).size, 25);
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

test("v4 keeps bounded structural choices and renders deterministic artwork for every recipe", () => {
  for (let slot = 0; slot < 56; slot++) {
    const levels = {
      rhythm: new Set(),
      proportion: new Set(),
      placement: new Set(),
      relationship: new Set(),
    };
    for (let i = 0; i < 150; i++) {
      // The stride preserves the recipe and the existing tone bits.
      const seed = slot + i * 43008;
      const structure = expandedArtStructure(seed);
      assert.equal(structure.family, slot % 14);
      assert.equal(structure.recipe, Math.floor(slot / 14));
      for (const axis of [
        "rhythm",
        "proportion",
        "placement",
        "relationship",
      ] as const) {
        const limit = axis === "relationship" ? 3 : 5;
        assert.ok(structure[axis] >= 0 && structure[axis] < limit);
        levels[axis].add(structure[axis]);
      }
    }
    for (const [axis, values] of Object.entries(levels))
      assert.equal(values.size, axis === "relationship" ? 3 : 5);
    const props = {
      seed: slot + 56 * 12345,
      line: "#123456",
      detail: "#abcdef",
    };
    const first = renderToStaticMarkup(createElement(CardArtworkV4, props));
    assert.equal(
      first,
      renderToStaticMarkup(createElement(CardArtworkV4, props)),
    );
    assert.doesNotMatch(first, /NaN|Infinity|undefined/);
    assert.ok(first.length > 100);
  }
});

test("the first-pass v3 artwork remains byte-stable after expanding the library", () => {
  // Captured from the archived first-pass renderer before the v4 integration.
  const frames = [...Array.from({ length: 30 }, (_, i) => i), 4294967295].map(
    (seed) =>
      renderToStaticMarkup(
        createElement(CardArtworkV3, {
          seed,
          line: "#123456",
          detail: "#abcdef",
        }),
      ),
  );
  assert.equal(
    createHash("sha256").update(frames.join("\n")).digest("hex"),
    "06c66bcbf1fdc2f077d76790e7350282cf623d389e3ab679d0cd515081dbc8a4",
  );
});

test("current generator uses only the original thirty recipes and remains repeatable", () => {
  assert.equal(CARD_ART_VERSION, 6);
  assert.equal(CARD_ART_COMPOSITIONS, 30);
  for (let slot = 0; slot < 30; slot++) {
    for (const multiplier of [0, 31, 9273, 71581]) {
      const seed = slot + multiplier * 30;
      assert.equal(artComposition(seed, 6), slot);
      assert.equal(artComposition(seed, 5), slot);
      assert.equal(artComposition(seed, 3), slot);
      assert.equal(artComposition(seed, 4), seed % 56);
      const props = { seed, line: "#123456", detail: "#abcdef" };
      const first = renderToStaticMarkup(createElement(CardArtworkV6, props));
      assert.equal(
        first,
        renderToStaticMarkup(createElement(CardArtworkV6, props)),
      );
      assert.doesNotMatch(first, /NaN|Infinity|undefined/);
    }
  }
});

test("locally saved prototype v4 choices stay frozen while Shuffle moves to the current version", () => {
  const frames = [...Array.from({ length: 56 }, (_, i) => i), 4294967295].map(
    (seed) =>
      renderToStaticMarkup(
        createElement(CardArtworkV4, {
          seed,
          line: "#123456",
          detail: "#abcdef",
        }),
      ),
  );
  assert.equal(
    createHash("sha256").update(frames.join("\n")).digest("hex"),
    "0462e7713bec3f8b22afef2a3993b32625a51e6b3e9ad8eddb8a66039f068385",
  );
});

test("saved v5 drawings remain byte-stable after motif refinement", () => {
  const frames = [...Array.from({ length: 30 }, (_, i) => i), 4294967295].map(
    (seed) =>
      renderToStaticMarkup(
        createElement(CardArtworkV5, {
          seed,
          line: "#123456",
          detail: "#abcdef",
        }),
      ),
  );
  assert.equal(
    createHash("sha256").update(frames.join("\n")).digest("hex"),
    "4fa7dbd401b512cadfb0098c7da309e695422fc97bf0ac7ac4dcfa6d637d61b9",
  );
});
