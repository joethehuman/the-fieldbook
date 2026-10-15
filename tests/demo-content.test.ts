import assert from "node:assert/strict";
import test from "node:test";
import { seedContent } from "../lib/seed";
import { freshWorkspace } from "../lib/store";
import { orderedDocs } from "../lib/docs-navigation";
import {
  gradeQuiz,
  optionIds,
  correctOptionIds,
  validQuestion,
} from "../lib/course-quiz";
import { graphemeCount } from "../lib/card-art";
import { videoSource } from "../lib/video";

test("the revenue demo has complete content and deliberate card hooks", () => {
  const data = freshWorkspace();
  assert.deepEqual(
    ["doc", "course", "brief"].map(
      (kind) => data.content.filter((c) => c.kind === kind).length,
    ),
    [25, 14, 10],
  );
  assert.equal(
    new Set(data.content.map((c) => c.id)).size,
    data.content.length,
  );
  assert.equal(data.curricula?.length, 5);
  for (const item of [
    ...data.content.filter((c) => c.kind !== "doc"),
    ...data.curricula!,
  ]) {
    const title = "title" in item ? item.title : item.name;
    const hook = item.cardArt?.shortTitle;
    assert.ok(hook?.trim(), title);
    assert.notEqual(hook, title, title);
    assert.ok(graphemeCount(hook!) <= 40, title);
  }
});

test("Docs traverse direct articles and subsections without missing or repeating a document", () => {
  const data = freshWorkspace(),
    sections = data.settings!.docSections!;
  assert.equal(sections.filter((s) => !s.parentId).length, 6);
  assert.equal(sections.filter((s) => s.parentId).length, 5);
  for (const id of ["hooli-start", "hooli-products", "hooli-competition"]) {
    assert.deepEqual(
      sections.find((s) => s.id === id)!.itemOrder!.map((i) => i.kind),
      ["doc", "section", "doc"],
    );
  }
  const docs = orderedDocs(
    data.content.filter((c) => c.kind === "doc"),
    data.settings!.docCategoryOrder,
    sections,
  );
  assert.equal(docs.length, 25);
  assert.equal(new Set(docs.map((d) => d.id)).size, 25);
  assert.equal(docs[0].title, "Your First Week in Hooli Sales");
  assert.equal(
    docs.at(-1)!.title,
    "Requesting an Executive Briefing with Gavin",
  );
});

test("every authored content link resolves to the intended published demo kind", () => {
  const paths = { docs: "doc", courses: "course", updates: "brief" };
  let count = 0;
  for (const c of seedContent)
    for (const body of [c.body, ...c.lessons.map((l) => l.body)]) {
      for (const match of body.matchAll(
        /\]\(#(docs|courses|updates)\/([^)?#\s]+)\)/g,
      )) {
        const target = seedContent.find((item) => item.id === match[2]);
        assert.ok(target, `${c.id}: ${match[0]}`);
        assert.equal(target.kind, paths[match[1] as keyof typeof paths]);
        assert.equal(target.status, "published");
        count++;
      }
    }
  assert.ok(count > 100);
});

test("every course opens with a trailer and its quiz can be passed and failed", () => {
  const data = freshWorkspace(),
    trailers = new Set<string>();
  let multiple = 0;
  for (const c of data.content.filter((c) => c.kind === "course")) {
    assert.equal(c.lessons.length, 3);
    assert.equal(c.questions.length, 2);
    assert.equal(videoSource(c.lessons[0].videoUrl!)?.type, "embed");
    trailers.add(c.lessons[0].videoUrl!);
    for (const q of c.questions) {
      assert.ok(validQuestion(q), q.id);
      assert.ok(q.explanation?.trim(), q.id);
      if (q.multiple) multiple++;
    }
    const correct = c.questions.map((q) =>
      correctOptionIds(q).map((id) => optionIds(q).indexOf(id)),
    );
    assert.equal(gradeQuiz(c, correct).passed, true);
    const wrong = structuredClone(correct);
    wrong[0] = [
      optionIds(c.questions[0]).findIndex(
        (id) => !correctOptionIds(c.questions[0]).includes(id),
      ),
    ];
    assert.equal(gradeQuiz(c, wrong).passed, false);
  }
  assert.equal(trailers.size, 3);
  assert.ok(multiple >= 4);
  assert.equal(
    data.content.find((c) => c.id === "course-8")!.requirePassing,
    false,
  );
});
