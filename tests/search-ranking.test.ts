import { test } from "node:test";
import assert from "node:assert/strict";
import {
  demoSearch,
  scorePassage,
  makeResult,
  type SourcePassage,
} from "../lib/search";
import { freshWorkspace } from "../lib/store";
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

test("partial title and lesson matches rank ahead of body matches", () => {
  const title = passage("Customer Data Handling", "");
  const lesson = {
    ...passage("Handling information", ""),
    lessonTitle: "Customer records",
  };
  const body = passage("General guidance", "Handling customer records.");
  for (const query of ["cust", "custome", "customer"]) {
    assert.ok(scorePassage(title, query) > scorePassage(lesson, query), query);
    assert.ok(scorePassage(lesson, query) > scorePassage(body, query), query);
    assert.ok(
      scorePassage(title, query, { fuzzy: false }) >
        scorePassage(body, query, { fuzzy: false }),
      query,
    );
  }
  assert.ok(
    scorePassage(
      { ...title, text: "Deletion procedures." },
      "custome deletion",
    ) > 0,
  );
  assert.equal(scorePassage(title, "custome unavailable"), 0);
});

test("typo matches retain field priority without displacing correctly typed body matches", () => {
  const title = passage("Customer Data Handling", "");
  const lesson = {
    ...passage("Handling information", ""),
    lessonTitle: "Customer records",
  };
  const body = passage("General guidance", "Customer records.");
  assert.ok(scorePassage(title, "custmoer") > scorePassage(lesson, "custmoer"));
  assert.ok(scorePassage(lesson, "custmoer") > scorePassage(body, "custmoer"));
  assert.ok(scorePassage(body, "custmoer") > 0);
  assert.equal(scorePassage(title, "custmoer", { fuzzy: false }), 0);
  assert.ok(
    scorePassage(passage("General guidance", "Harbor operations"), "harbor") >
      scorePassage(passage("Harbour operations", ""), "harbor"),
  );
});

test("sample customer titles stay ahead of body matches throughout typing and filtering", () => {
  const content = freshWorkspace().content;
  for (const filter of ["all", "doc", "course", "brief"] as const) {
    const titles = content
      .filter(
        (item) =>
          item.status === "published" &&
          (filter === "all" || item.kind === filter) &&
          /\bcustomer\b/i.test(item.title),
      )
      .map((item) => item.id)
      .sort();
    assert.ok(titles.length > 0);
    for (const query of ["cust", "custome", "customer", "custmoer"]) {
      const response = demoSearch(content, query, filter);
      assert.deepEqual(
        response.results
          .slice(0, titles.length)
          .map((item) => item.contentId)
          .sort(),
        titles,
        `${filter}: ${query}`,
      );
    }
  }
});

test("title matches survive the result limit and lesson matches retain the correct destination", () => {
  const doc = freshWorkspace().content.find((item) => item.kind === "doc")!;
  const title = {
    ...doc,
    id: "z-title",
    title: "Customer Data Handling",
    summary: "",
    body: "",
  };
  const course = {
    ...doc,
    id: "z-lesson",
    kind: "course" as const,
    title: "Working with information",
    summary: "",
    body: "",
    lessons: [
      {
        id: "records",
        title: "Customer records",
        body: "Handling records safely.",
      },
    ],
  };
  const content = [
    ...Array.from({ length: 40 }, (_, i) => ({
      ...doc,
      id: `a-body-${i}`,
      title: "General guidance",
      summary: "",
      body: "Customer records.",
    })),
    title,
    course,
    { ...title, id: "draft", status: "draft" as const },
  ];
  for (const query of ["custome", "customer"]) {
    const response = demoSearch(content, query, "all");
    assert.deepEqual(
      response.results.slice(0, 2).map((item) => item.contentId),
      [title.id, course.id],
    );
    assert.equal(response.results[1].lessonId, "records");
    assert.match(response.results[1].href, /\?lesson=records$/);
    assert.equal(response.results.length, 30);
    assert.equal(response.hasMore, true);
    assert.ok(response.results.every((item) => item.contentId !== "draft"));
  }
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
