import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { DEMO_PROFILE_IDS } from "../lib/demo-session";
import {
  assignedLearningCards,
  curriculumProgress,
} from "../lib/learning-cards";
import { requiredSequence } from "../lib/learning";
import { isComplete } from "../lib/types";
import { seedContent } from "../lib/seed";
import { freshWorkspace, loadWorkspace, type Workspace } from "../lib/store";
import {
  availableDocSections,
  createDocSection,
  orderedDocs,
} from "../lib/docs-navigation";
import {
  gradeQuiz,
  optionIds,
  correctOptionIds,
  validQuestion,
} from "../lib/course-quiz";
import { graphemeCount } from "../lib/card-art";
import { videoSource } from "../lib/video";

function cachedWorkspace(t: TestContext, data: Workspace) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map([["fieldbook.workspace.v1", JSON.stringify(data)]]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  });
  return values;
}

test("fresh demo navigation has one configured section tree and accepts new sections", () => {
  const data = freshWorkspace();
  const sections = availableDocSections(
    data.content.filter((item) => item.kind === "doc"),
    data.settings!.docCategoryOrder,
    data.settings!.docSections,
  );
  assert.equal(sections.length, data.settings!.docSections!.length);
  assert.equal(
    createDocSection(sections, "Additional reference").length,
    sections.length + 1,
  );
});

test("cached demo navigation repairs duplicate legacy roots without replacing authored content", (t) => {
  const data = freshWorkspace();
  data.settings!.docCategoryOrder = data
    .settings!.docSections!.filter((section) => !section.parentId)
    .map((section) => section.name);
  const doc = data.content.find((item) => item.kind === "doc")!;
  doc.title = "My edited title";
  doc.body = "My saved text stays here.";
  const sections = structuredClone(data.settings!.docSections);
  const values = cachedWorkspace(t, data);
  const loaded = loadWorkspace();
  assert.deepEqual(loaded.settings!.docCategoryOrder, []);
  assert.deepEqual(loaded.settings!.docSections, sections);
  assert.equal(
    loaded.content.find((item) => item.id === doc.id)!.body,
    doc.body,
  );
  assert.equal(
    loaded.content.find((item) => item.id === doc.id)!.title,
    doc.title,
  );
  assert.deepEqual(
    JSON.parse(values.get("fieldbook.workspace.v1")!).settings.docCategoryOrder,
    [],
  );
});

for (const scenario of ["legacy document", "unmatched category"] as const) {
  test(`cached navigation preserves ${scenario} placement`, (t) => {
    const data = freshWorkspace();
    data.settings!.docCategoryOrder = data
      .settings!.docSections!.filter((section) => !section.parentId)
      .map((section) => section.name);
    if (scenario === "legacy document")
      delete data.content.find((item) => item.kind === "doc")!.sectionId;
    else data.settings!.docCategoryOrder.push("Older reference section");
    const order = [...data.settings!.docCategoryOrder];
    cachedWorkspace(t, data);
    assert.deepEqual(loadWorkspace().settings!.docCategoryOrder, order);
  });
}

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
  assert.equal(docs[0].title, "Your First Week at Hooli");
  assert.equal(docs.at(-1)!.title, "Booking Time with Gavin");
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

test("each selectable profile has a distinct mix of curricula and standalone For you courses", () => {
  const data = freshWorkspace();
  const mixes = new Set<string>();
  for (const id of DEMO_PROFILE_IDS) {
    const user = data.users.find((person) => person.id === id)!;
    const progress = data.progress[id];
    const cards = assignedLearningCards(
      requiredSequence(data.content, user, data.groups),
      data.curricula!,
      user,
      data.groups,
    ).filter((item) =>
      item.kind === "course"
        ? !isComplete(item.course, progress)
        : !curriculumProgress(item.courses, progress).complete,
    );
    const curricula = cards.filter((item) => item.kind === "curriculum");
    const standalone = cards.filter((item) => item.kind === "course");
    assert.ok(curricula.length > 0, user.name);
    assert.ok(standalone.length >= 1 && standalone.length <= 2, user.name);
    const represented = new Set(
      curricula.flatMap((item) => item.courses.map((course) => course.id)),
    );
    for (const item of standalone)
      assert.ok(!represented.has(item.course.id), user.name);
    mixes.add(
      standalone
        .map((item) => item.course.id)
        .sort()
        .join(","),
    );
  }
  assert.equal(mixes.size, DEMO_PROFILE_IDS.length);
});
