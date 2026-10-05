import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace, loadWorkspace } from "../lib/store";
import { seedContent } from "../lib/seed";
import { videoSource } from "../lib/video";
import { withPublishedSnapshots } from "../lib/demo-publication";

test("every demo course opens with one of three embeddable trailers and preserves its lesson", () => {
  const original = seedContent.filter((item) => item.kind === "course");
  const courses = freshWorkspace().content.filter((item) => item.kind === "course");
  const urls = new Set<string>();
  assert.equal(courses.length, original.length);
  for (const course of courses) {
    const before = original.find((item) => item.id === course.id)!;
    const first = course.lessons[0];
    const oldFirst = before.lessons[0];
    assert.equal(first.id, oldFirst.id);
    assert.equal(first.title, oldFirst.title);
    assert.equal(
      first.body,
      oldFirst.videoUrl
        ? `[Video](${oldFirst.videoUrl})\n\n${oldFirst.body}`
        : oldFirst.body,
    );
    assert.deepEqual(course.lessons.slice(1), before.lessons.slice(1));
    assert.equal(videoSource(first.videoUrl!)?.type, "embed");
    urls.add(first.videoUrl!);
  }
  assert.equal(urls.size, 3);
});

test("saved demo refreshes untouched lessons and preserves author changes", () => {
  const stored = withPublishedSnapshots(freshWorkspace());
  stored.content = stored.content.map((item) => {
    const original = seedContent.find((seed) => seed.id === item.id);
    if (item.kind !== "course" || !original) return item;
    return {
      ...item,
      lessons: item.id === "course-3"
        ? [{ ...original.lessons[0], body: "A custom opening." }, ...original.lessons.slice(1)]
        : structuredClone(original.lessons),
    };
  });
  stored.publishedContent = stored.publishedContent!.map((item) => {
    const original = seedContent.find((seed) => seed.id === item.id);
    return item.kind === "course" && original
      ? { ...item, lessons: structuredClone(original.lessons) }
      : item;
  });
  const values = new Map([["fieldbook.workspace.v1", JSON.stringify(stored)]]);
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    const loaded = loadWorkspace();
    assert.equal(loaded.content.find((item) => item.id === "course-3")!.lessons[0].body, "A custom opening.");
    assert.equal(loaded.content.find((item) => item.id === "course-3")!.lessons[0].videoUrl, undefined);
    assert.ok(loaded.content.find((item) => item.id === "course-4")!.lessons[0].videoUrl);
    assert.ok(loaded.publishedContent!.find((item) => item.id === "course-4")!.lessons[0].videoUrl);
    assert.ok(JSON.parse(values.get("fieldbook.workspace.v1")!).content.find((item: { id: string }) => item.id === "course-4").lessons[0].videoUrl);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous });
  }
});
