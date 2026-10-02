import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePassage, makeResult, type SourcePassage } from "../lib/search";
const passage = (title: string, text: string): SourcePassage => ({
  contentId: "published",
  kind: "course",
  title,
  text,
  lessonTitle: null,
  lessonId: null,
  passageId: "content",
  publishedRevision: 2,
  contentDate: null,
});
test("shared ranking prefers the exact title and keeps Unicode, reordered prefixes and typo matching", () => {
  assert.ok(
    scorePassage(passage("Quartz harbor", ""), "Quartz harbor") >
      scorePassage(
        passage("Recent announcement", "Quartz harbor"),
        "Quartz harbor",
      ),
  );
  assert.ok(
    scorePassage(
      passage("Course", "Équipe 日本語 préparation"),
      "prépar équip",
    ) > 0,
  );
  assert.ok(
    scorePassage(passage("Course", "Équipe 日本語 préparation"), "日本") > 0,
  );
  assert.ok(
    scorePassage(passage("Course", "disaster recovery"), "disater recovery") >
      0,
  );
  assert.equal(
    scorePassage(passage("Course", "marker003"), "marker002", { fuzzy: false }),
    0,
  );
  assert.equal(scorePassage(passage("Course", "Quartz"), "quartz harbor"), 0);
});
test("body excerpts explain matches beyond introductory vocabulary without a result limit", () => {
  const source = passage(
    "General introduction",
    `${"Unrelated opening words. ".repeat(40)} Quartz harbor signals explain this lesson.`,
  );
  assert.ok(scorePassage(source, "harb quart") > 0);
  const result = makeResult(source, "harb quart");
  assert.match(result.excerpt, /Quartz harbor/);
  assert.ok(result.highlights.includes("Quartz"));
  assert.equal(
    Array.from({ length: 100 }, () => source).filter(
      (item) => scorePassage(item, "harb quart") > 0,
    ).length,
    100,
  );
});

test("strict picker excerpts center the real prefix match while ordinary search keeps fuzzy excerpts", () => {
  const source = passage(
    "Material",
    `Quark appears near the opening. ${"Unrelated material. ".repeat(30)} Quartz signals identify the actual prefix match.`,
  );
  assert.ok(scorePassage(source, "quart", { fuzzy: false }) > 0);
  const strict = makeResult(source, "quart", { fuzzy: false });
  assert.match(strict.excerpt, /Quartz signals/);
  assert.doesNotMatch(strict.excerpt, /Quark/);
  assert.ok(strict.highlights.includes("Quartz"));
  assert.ok(!strict.highlights.includes("Quark"));
  const ordinary = makeResult(source, "quart");
  assert.match(ordinary.excerpt, /Quark/);
  assert.ok(ordinary.highlights.includes("Quark"));
});
