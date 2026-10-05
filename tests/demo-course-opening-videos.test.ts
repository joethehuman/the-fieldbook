import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace, loadWorkspace } from "../lib/store";
import { seedContent } from "../lib/seed";
import { videoSource } from "../lib/video";
import { withPublishedSnapshots } from "../lib/demo-publication";

test("every demo course opens with one of three trailers and no other first-lesson media", () => {
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
    assert.doesNotMatch(first.body, /!\[[^\]]*\]\(|\[(?:Video|Recording)\]\(/i);
    if (!(["course-1", "course-2"].includes(course.id)))
      assert.equal(first.body, oldFirst.body);
    assert.deepEqual(course.lessons.slice(1), before.lessons.slice(1));
    assert.equal(videoSource(first.videoUrl!)?.type, "embed");
    urls.add(first.videoUrl!);
  }
  assert.equal(urls.size, 3);
  assert.match(courses.find((item) => item.id === "course-1")!.lessons[0].body, /A clear problem statement gives a team something stable/);
  assert.match(courses.find((item) => item.id === "course-2")!.lessons[0].body, /explain the user problem first and the method second/);
  assert.doesNotMatch(courses.find((item) => item.id === "course-2")!.lessons[0].body, /season 6 trailer/i);
});

test("saved demo removes prior extra media while preserving author changes", () => {
  const stored = withPublishedSnapshots(freshWorkspace());
  const previousOpening = (item: (typeof stored.content)[number]) => {
    const original = seedContent.find((seed) => seed.id === item.id);
    if (item.kind !== "course" || !original) return item;
    const first = original.lessons[0];
    return {
      ...item,
      lessons: [{
        ...first,
        videoUrl: item.lessons[0].videoUrl,
        body: first.videoUrl ? `[Video](${first.videoUrl})\n\n${first.body}` : first.body,
      }, ...original.lessons.slice(1)],
    };
  };
  stored.content = stored.content.map((item) => {
    const previous = previousOpening(item);
    return item.id === "course-3"
      ? { ...previous, lessons: [{ ...previous.lessons[0], body: "A custom opening." }, ...previous.lessons.slice(1)] }
      : previous;
  });
  stored.publishedContent = stored.publishedContent!.map(previousOpening);
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
    assert.ok(loaded.content.find((item) => item.id === "course-3")!.lessons[0].videoUrl);
    assert.doesNotMatch(loaded.content.find((item) => item.id === "course-1")!.lessons[0].body, /!\[/);
    assert.doesNotMatch(loaded.content.find((item) => item.id === "course-2")!.lessons[0].body, /\[Video\]|season 6 trailer/i);
    assert.doesNotMatch(loaded.publishedContent!.find((item) => item.id === "course-2")!.lessons[0].body, /\[Video\]|season 6 trailer/i);
    assert.doesNotMatch(JSON.parse(values.get("fieldbook.workspace.v1")!).content.find((item: { id: string }) => item.id === "course-2").lessons[0].body, /\[Video\]/);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous });
  }
});
