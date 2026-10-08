import { test } from "node:test";
import assert from "node:assert/strict";
import { createLessonImageAltValidator, hasMissingImageAlt } from "../lib/markdown-compatibility";

function validator() {
  const parsed: string[] = [];
  const validate = createLessonImageAltValidator((body) => {
    parsed.push(body);
    return hasMissingImageAlt(body);
  });
  return { validate, parsed };
}

test("unchanged lesson bodies reuse parsing through title edits and reordering", () => {
  const { validate, parsed } = validator();
  const lessons = [
    { id: "one", title: "First", body: "![Useful description](/image.png)" },
    { id: "two", title: "Second", body: "![](/image.png)" },
  ];
  assert.deepEqual([...validate(lessons)], ["two"]);
  assert.equal(parsed.length, 2);
  const renamedAndReordered = [
    { ...lessons[1], title: "Now first" },
    { ...lessons[0], title: "Now second" },
  ];
  assert.deepEqual([...validate(renamedAndReordered)], ["two"]);
  assert.equal(parsed.length, 2);
  assert.deepEqual([...validate([...lessons, { ...lessons[1], id: "copy" }])], ["two", "copy"]);
  assert.equal(parsed.length, 3);
});

test("edited, restored and imported Markdown is checked against its exact current body", () => {
  const { validate, parsed } = validator();
  const valid = { id: "one", body: "![Diagram][figure]\n\n[figure]: /image.png" };
  const invalid = { ...valid, body: "![ ][figure]\n\n[figure]: /image.png" };
  const unchanged = { id: "two", body: "Unchanged lesson." };
  assert.deepEqual([...validate([valid, unchanged])], []);
  assert.deepEqual([...validate([invalid, unchanged])], ["one"]);
  assert.equal(parsed.length, 3);
  assert.deepEqual([...validate([valid, unchanged])], []);
  assert.equal(parsed.length, 4);
  assert.deepEqual([...validate([{ ...valid, body: "Imported ![](/other.png)" }, unchanged])], ["one"]);
  assert.equal(parsed.length, 5);
});

test("removed lessons are evicted and each editor owns an independent cache", () => {
  const first = validator();
  const second = validator();
  const lesson = { id: "one", body: "![](/image.png)" };
  first.validate([lesson]);
  assert.deepEqual([...first.validate([])], []);
  assert.deepEqual([...first.validate([lesson])], ["one"]);
  assert.equal(first.parsed.length, 2);
  assert.deepEqual([...second.validate([lesson])], ["one"]);
  assert.equal(second.parsed.length, 1);
  assert.deepEqual([...first.validate([lesson])], ["one"]);
  assert.equal(first.parsed.length, 2);
});
